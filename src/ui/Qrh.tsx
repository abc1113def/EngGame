import type { Game } from '../game/game';
export function QrhBook({ onClose }: { game: Game | null; onClose: () => void }) {
  return <div className="overlay" onClick={onClose} />;
}
