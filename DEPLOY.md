# Как поставить игру на свой сервер

Игра — это статический сайт: HTML, CSS, JS, около 700 КБ (по сети ~220 КБ в gzip). Базы данных и серверной части нет, поэтому хватит самого слабого VPS (1 ядро, 1 ГБ ОЗУ). Сайт раздаёт nginx, ему нужно 5–10 МБ памяти.

Ниже — пошаговая инструкция для **Ubuntu 22.04/24.04 или Debian 11/12**. Для CentOS/Alma/Rocky отличия указаны отдельно.

## Что понадобится

- **Доступ к серверу по SSH**: `ssh user@IP_СЕРВЕРА`. `user` — ваш логин; у него должен быть `sudo`, либо это `root`.
- **По желанию — домен**. A-запись домена (например, `game.example.ru`) должна указывать на IP сервера. Без домена игра откроется по `http://IP_СЕРВЕРА/`, но без HTTPS.
- **Код игры**. Репозиторий: `https://github.com/abc1113def/EngGame`, ветка `claude/affectionate-cray-eyz2tv`. Если репозиторий приватный, при `git clone` GitHub попросит логин и токен вместо пароля: Settings → Developer settings → Personal access tokens, право *Contents: Read*. Можно и не клонировать на сервер вовсе: варианты А и В копируют уже готовые файлы.

Выберите один из вариантов:

| Вариант | Где собирается | Что нужно | Когда удобен |
|---|---|---|---|
| **А** | на вашем компьютере | Node.js 18+ на компьютере | обычный случай, сервер остаётся «чистым» |
| **Б** | прямо на сервере | Node.js 18+ на сервере | нет Node.js на компьютере, обновление одной командой |
| **В** | нигде | один готовый файл | на сервере уже есть сайт, надо просто «положить игру рядом» |
| **Г** | в Docker | Docker на сервере | если сервер уже работает на Docker |

---

## Шаг 1. Подготовить сервер (для вариантов А и Б)

Скопируйте на сервер скрипт настройки и запустите его. С компьютера, из папки проекта:

```bash
scp deploy/server-setup.sh user@IP_СЕРВЕРА:~/
ssh user@IP_СЕРВЕРА
sudo bash server-setup.sh                  # игра будет по http://IP_СЕРВЕРА/
# или
sudo bash server-setup.sh game.example.ru  # если есть домен
# или
sudo PORT=8080 bash server-setup.sh        # если 80-й порт уже занят другим сайтом
```

Скрипт:
- ставит nginx;
- создаёт папку `/var/www/a320`;
- пишет конфиг сайта со сжатием gzip и кешированием;
- открывает порт в firewall (если ufw или firewalld включены);
- проверяет конфиг и перезапускает nginx.

Скрипт можно запускать повторно — он ничего не ломает.

Проверка: откройте в браузере `http://IP_СЕРВЕРА/` (или `http://IP_СЕРВЕРА:8080/`). Должна появиться страница «Сервер готов».

<details>
<summary>То же самое вручную, без скрипта</summary>

```bash
sudo apt update && sudo apt install -y nginx
sudo mkdir -p /var/www/a320 && sudo chown $USER: /var/www/a320
sudo cp deploy/nginx.conf /etc/nginx/sites-available/a320      # файл из репозитория
sudo ln -s /etc/nginx/sites-available/a320 /etc/nginx/sites-enabled/a320
sudo rm -f /etc/nginx/sites-enabled/default                     # стандартная заглушка nginx
sudo nginx -t && sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'                                     # если включён ufw
```

В `deploy/nginx.conf` при желании замените `server_name _;` на свой домен.
</details>

---

## Шаг 2. Выложить игру

### Вариант А — собрать у себя и скопировать (рекомендуется)

На компьютере установите [Node.js](https://nodejs.org) версии 18 или новее (LTS). Затем:

```bash
git clone -b claude/affectionate-cray-eyz2tv https://github.com/abc1113def/EngGame.git
cd EngGame
```

**Linux / macOS:**

```bash
./deploy/deploy.sh user@IP_СЕРВЕРА
```

**Windows** (PowerShell; ssh и scp уже встроены в Windows 10/11):

```powershell
powershell -ExecutionPolicy Bypass -File deploy\deploy.ps1 user@IP_СЕРВЕРА
```

Скрипт сам выполнит `npm ci` и `npm run build`, скопирует папку `dist/` в `/var/www/a320` и выставит права. Если хотите скопировать вручную (например, через WinSCP или FileZilla), выполните `npm ci && npm run build` и положите **содержимое** папки `dist/` в `/var/www/a320`. В корне папки должны оказаться `index.html` и папка `assets/`.

### Вариант Б — собрать прямо на сервере

Сборка занимает пик около 300 МБ памяти, на 1 ГБ это проходит. На всякий случай стоит добавить файл подкачки, если его нет (`free -h` показывает Swap: 0):

```bash
sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Установите Node.js 18+ и git:

```bash
# Ubuntu 24.04 / Debian 12 — подходящая версия есть в стандартных пакетах:
sudo apt install -y git nodejs npm
# Ubuntu 22.04 / Debian 11 и старше — там Node.js слишком старый, ставим 20-ю версию:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs git
node -v    # должно быть v18 или выше
```

Скачайте и соберите игру:

```bash
git clone -b claude/affectionate-cray-eyz2tv https://github.com/abc1113def/EngGame.git
cd EngGame
./deploy/build-on-server.sh            # соберёт и выложит в /var/www/a320
```

Обновление на свежую версию — одна команда:

```bash
cd ~/EngGame && git pull && ./deploy/build-on-server.sh
```

### Вариант В — один файл в уже существующий сайт

Игру можно собрать в один самодостаточный HTML-файл: всё встроено внутрь, нужны только шрифты Google Fonts.

```bash
npm ci && npm run build:single       # результат: dist-single/index.html
scp dist-single/index.html user@IP_СЕРВЕРА:/var/www/html/cold-dark.html
```

Игра откроется по `http://ВАШ_САЙТ/cold-dark.html`. Настраивать сервер не нужно: подойдёт любой веб-сервер (nginx, Apache, Caddy), обычный хостинг или GitHub Pages. Этот же файл открывается и просто двойным щелчком на компьютере.

### Вариант Г — Docker

```bash
git clone -b claude/affectionate-cray-eyz2tv https://github.com/abc1113def/EngGame.git
cd EngGame
docker build -t cold-dark .
docker run -d --name cold-dark -p 80:80 --restart unless-stopped cold-dark   # или -p 8080:80
```

Образ занимает около 25 МБ, работающий контейнер — около 10 МБ ОЗУ. Сборка внутри Docker на 1 ГБ проходит; если её прерывает нехватка памяти, добавьте swap (см. вариант Б).

---

## Шаг 3. Проверить

- **На сервере:** `curl -I http://localhost/` должен ответить `HTTP/1.1 200 OK`.
- **В браузере:** `http://IP_СЕРВЕРА/` или ваш домен. Откроется меню «COLD & DARK» с выбором сценария.
- **После обновления:** если видна старая версия, обновите страницу с очисткой кеша (Ctrl+F5).

## Шаг 4. HTTPS (если есть домен)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d game.example.ru
```

Certbot сам добавит сертификат в конфиг nginx и будет продлевать его автоматически. Порт 443 должен быть открыт: `sudo ufw allow 443/tcp`.

---

## Если на сервере уже есть сайт

**Отдельный домен или поддомен** (`game.example.ru`): запустите `sudo bash server-setup.sh game.example.ru`. Ваш основной сайт скрипт не тронет.

**В подпапке основного сайта** (`example.ru/a320/`): игра работает из любой папки. Положите файлы в `/var/www/a320`. Затем добавьте в **существующий** блок `server { ... }` вашего сайта:

```nginx
location = /a320 { return 301 /a320/; }
location /a320/ {
    alias /var/www/a320/;
    index index.html;
    try_files $uri $uri/ /a320/index.html;
}
```

Затем выполните `sudo nginx -t && sudo systemctl reload nginx`.

**Apache:** скопируйте содержимое `dist/` в `/var/www/html/a320/`, игра откроется по `http://сайт/a320/`. Ничего настраивать не нужно.

**Caddy** (HTTPS получает сам) — в `/etc/caddy/Caddyfile`:

```
game.example.ru {
    root * /var/www/a320
    encode gzip
    file_server
}
```

## CentOS / AlmaLinux / Rocky

`server-setup.sh` работает и здесь: ставит nginx через dnf, кладёт конфиг в `/etc/nginx/conf.d/a320.conf`, настраивает SELinux и firewalld. Одно отличие: в `/etc/nginx/nginx.conf` обычно уже есть сайт по умолчанию на 80-м порту. В этом случае запустите скрипт с доменом или с `PORT=8080`. Другой вариант — удалите этот блок `server { ... }` из `nginx.conf`.

## Частые проблемы

| Симптом | Причина и решение |
|---|---|
| `403 Forbidden` | У nginx нет прав на чтение. `sudo chmod -R a+rX /var/www/a320`, а также права `a+x` на `/var/www`. На CentOS: `sudo chcon -R -t httpd_sys_content_t /var/www/a320` |
| Открывается «Welcome to nginx!» | Включена стандартная заглушка: `sudo rm /etc/nginx/sites-enabled/default && sudo systemctl reload nginx` |
| Пустая белая страница | В `/var/www/a320` лежит папка `dist/` целиком, а нужно её **содержимое**. `index.html` должен лежать прямо в `/var/www/a320` |
| `404` на `/assets/...` | Скопированы не все файлы: повторите копирование папки `assets/` |
| Сайт не открывается снаружи, а `curl localhost` работает | Закрыт порт: `sudo ufw allow 80/tcp`. Ещё проверьте firewall в панели хостинга (Security groups и т. п.) |
| `nginx -t`: `address already in use` / `bind() to 0.0.0.0:80 failed` | Порт 80 занят: часто это apache2 (`sudo systemctl disable --now apache2`) или другой сайт. Можно запустить скрипт с `PORT=8080` |
| `nginx -t`: `[::]:80 failed (97: Address family not supported)` | На сервере нет IPv6: уберите строку `listen [::]:80;` из конфига (скрипт `server-setup.sh` делает это сам) |
| `npm ci` на сервере падает с `Killed` | Не хватило памяти: добавьте swap (см. вариант Б) или соберите на компьютере (вариант А) |
| Нет звука | Браузер включает звук только после щелчка на странице: нажмите «Начать». Ещё проверьте значок 🔊 в верхней панели |
