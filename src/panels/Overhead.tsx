import { Digits, FirePb, Knob, Light, Mod, Pb, Rotary, Row, Toggle } from '../controls/Controls';
import { useSim } from '../ui/hooks';

function BatV({ i }: { i: 0 | 1 }) {
  const v = useSim((s) => {
    const b = s.elec.bat[i];
    const sw = s.sw[`BAT${i + 1}`];
    return sw === 1 ? b.v : 23.6 + 3.4 * b.charge;
  });
  return <Digits text={v.toFixed(1) + ' V'} color={v < 25.5 ? 'amber' : 'green'} w={70} />;
}

function Sys({ t, c }: { t: string; c: string }) {
  return (
    <div className="sys-lbl" style={{ color: c }}>
      {t}
    </div>
  );
}

function FirePanel({ e, title }: { e: 'ENG1' | 'ENG2' | 'APU'; title: string }) {
  return (
    <div className="firepanel">
      <div className="mod-sub">{title}</div>
      <Row gap={14} style={{ alignItems: 'flex-end' }}>
        <FirePb id={`${e}_FIRE`} label={title} />
        <Pb id={`${e}_AGENT1`} w={46} h={40} />
        {e !== 'APU' && <Pb id={`${e}_AGENT2`} w={46} h={40} />}
        <Pb id={`${e}_FIRE_TEST`} w={40} h={34} inner="TEST" />
      </Row>
    </div>
  );
}

export function Overhead() {
  return (
    <div className="canvas ovhd" style={{ width: 1600, height: 1250 }}>
      {/* ===================== левая колонка ===================== */}
      <Mod x={10} y={10} w={370} h={300} title="ADIRS">
        <div style={{ position: 'absolute', right: 10, top: 2 }}>
          <Light id="ON_BAT" text="ON BAT" w={56} />
        </div>
        <Row gap={30} style={{ marginTop: 22, justifyContent: 'center' }}>
          <Pb id="ADR1" label="ADR 1" />
          <Pb id="ADR3" label="ADR 3" />
          <Pb id="ADR2" label="ADR 2" />
        </Row>
        <Row gap={30} style={{ marginTop: 8, justifyContent: 'center' }}>
          <Pb id="IR1" label="IR 1" />
          <Pb id="IR3" label="IR 3" />
          <Pb id="IR2" label="IR 2" />
        </Row>
        <Row gap={2} style={{ marginTop: 4, justifyContent: 'center' }}>
          <Rotary id="IR1_MODE" label="IR 1" size={36} />
          <Rotary id="IR3_MODE" label="IR 3" size={36} />
          <Rotary id="IR2_MODE" label="IR 2" size={36} />
        </Row>
      </Mod>
      <Mod x={10} y={320} w={370} h={100} title="FLT CTL">
        <Row gap={40} style={{ justifyContent: 'center' }}>
          <Pb id="ELAC1" />
          <Pb id="SEC1" />
          <Pb id="FAC1" />
        </Row>
      </Mod>
      <Mod x={10} y={430} w={370} h={100} title="EVAC">
        <Row gap={30} style={{ justifyContent: 'center' }}>
          <Pb id="EVAC_CMD" red />
          <Pb id="EVAC_HORN" inner="" />
          <Toggle id="EVAC_CAPT" h={44} />
        </Row>
      </Mod>
      <Mod x={10} y={540} w={370} h={100} title="EMER ELEC PWR">
        <Row gap={30} style={{ justifyContent: 'center' }}>
          <Pb id="RAT_EMER" />
          <Pb id="GEN1_LINE" />
          <Pb id="EMER_GEN_TEST" />
        </Row>
      </Mod>
      <Mod x={10} y={650} w={370} h={100} title="GPWS">
        <Row gap={12} style={{ justifyContent: 'center' }}>
          <Pb id="GPWS_SYS" w={44} />
          <Pb id="GPWS_GS" w={44} />
          <Pb id="GPWS_FLAP" w={44} />
          <Pb id="GPWS_LDG3" w={44} />
          <Pb id="GPWS_TERR" w={44} />
        </Row>
      </Mod>
      <Mod x={10} y={760} w={175} h={100} title="RCDR">
        <Row gap={10} style={{ justifyContent: 'center' }}>
          <Pb id="RCDR_GND" w={44} />
          <Pb id="CVR_TEST" w={40} h={36} inner="" />
        </Row>
      </Mod>
      <Mod x={195} y={760} w={185} h={100} title="OXYGEN">
        <Row gap={12} style={{ justifyContent: 'center' }}>
          <Pb id="OXY_MASK" w={44} />
          <Pb id="OXY_CREW" w={44} />
        </Row>
      </Mod>
      <Mod x={10} y={870} w={370} h={90} title="CALLS">
        <Row gap={16} style={{ justifyContent: 'center' }}>
          <Pb id="CALL_MECH" w={46} h={30} />
          <Pb id="CALL_FWD" w={46} h={30} />
          <Pb id="CALL_AFT" w={46} h={30} />
          <Pb id="CALL_ALL" w={46} h={30} />
        </Row>
      </Mod>
      <Mod x={10} y={970} w={370} h={130} title="WIPER">
        <Row gap={40} style={{ justifyContent: 'center' }}>
          <Rotary id="WIPER_L" size={36} />
          <Pb id="RAIN_L" w={40} h={34} />
        </Row>
      </Mod>

      {/* ===================== центр ===================== */}
      <Mod x={390} y={10} w={820} h={170} title="FIRE" titleColor="#ff8a80">
        <Row gap={18} style={{ justifyContent: 'space-around', marginTop: 6 }}>
          <FirePanel e="ENG1" title="ENG 1" />
          <FirePanel e="APU" title="APU" />
          <FirePanel e="ENG2" title="ENG 2" />
        </Row>
      </Mod>
      <Mod x={390} y={190} w={820} h={120} title="HYD">
        <Row gap={34} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <div className="col">
            <Sys t="GREEN" c="#5fe08a" />
            <Pb id="HYD_G_ENG1" />
          </div>
          <div className="col">
            <Sys t="BLUE" c="#68b6ff" />
            <Pb id="HYD_B_ELEC" />
          </div>
          <Pb id="HYD_PTU" />
          <div className="col">
            <Sys t="YELLOW" c="#ffd75e" />
            <Row gap={20}>
              <Pb id="HYD_Y_ENG2" />
              <Pb id="HYD_Y_ELEC" />
            </Row>
          </div>
          <Pb id="HYD_RAT" w={44} />
        </Row>
      </Mod>
      <Mod x={390} y={320} w={820} h={140} title="FUEL">
        <Row gap={18} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 10 }}>
          <Pb id="FUEL_L1" />
          <Pb id="FUEL_L2" />
          <div style={{ width: 16 }} />
          <Pb id="FUEL_MODE" />
          <div style={{ width: 8 }} />
          <Pb id="FUEL_C1" />
          <Pb id="FUEL_XFEED" />
          <Pb id="FUEL_C2" />
          <div style={{ width: 24 }} />
          <Pb id="FUEL_R1" />
          <Pb id="FUEL_R2" />
        </Row>
      </Mod>
      <Mod x={390} y={470} w={820} h={210} title="ELEC">
        <Row gap={22} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 4 }}>
          <Pb id="COMMERCIAL" />
          <Pb id="GALY_CAB" />
          <div className="col" style={{ gap: 4 }}>
            <div className="pb-label">BAT 1</div>
            <BatV i={0} />
            <Pb id="BAT1" noLabel />
          </div>
          <div className="col" style={{ gap: 4 }}>
            <div className="pb-label">BAT 2</div>
            <BatV i={1} />
            <Pb id="BAT2" noLabel />
          </div>
          <Pb id="AC_ESS_FEED" />
        </Row>
        <Row gap={24} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 8 }}>
          <Pb id="IDG1" w={44} />
          <Pb id="GEN1" />
          <Pb id="APU_GEN" />
          <Pb id="BUS_TIE" />
          <Pb id="EXT_PWR" />
          <Pb id="GEN2" />
          <Pb id="IDG2" w={44} />
        </Row>
      </Mod>
      <Mod x={390} y={690} w={820} h={200} title="AIR COND">
        <Row gap={26} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <Knob id="TEMP_CKPT" ends={['C', 'H']} />
          <Knob id="TEMP_FWD" ends={['C', 'H']} />
          <Knob id="TEMP_AFT" ends={['C', 'H']} />
          <Pb id="HOT_AIR" />
          <Rotary id="PACK_FLOW" size={34} />
        </Row>
        <Row gap={20} style={{ justifyContent: 'center', alignItems: 'flex-end', marginTop: 2 }}>
          <Pb id="PACK1" />
          <Pb id="ENG1_BLEED" />
          <Pb id="APU_BLEED" />
          <Rotary id="XBLEED" size={34} />
          <Pb id="ENG2_BLEED" />
          <Pb id="PACK2" />
          <Pb id="RAM_AIR" w={44} />
        </Row>
      </Mod>
      <Mod x={390} y={900} w={400} h={115} title="ANTI ICE">
        <Row gap={22} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <Pb id="WING_AI" />
          <Pb id="ENG1_AI" />
          <Pb id="ENG2_AI" />
          <Pb id="PROBE_HEAT" w={60} />
        </Row>
      </Mod>
      <Mod x={800} y={900} w={410} h={115} title="CABIN PRESS">
        <Row gap={14} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <Toggle id="MAN_VS" h={50} />
          <Pb id="PRESS_MODE" />
          <Rotary id="LDG_ELEV" size={30} spread={270} />
          <Pb id="DITCHING" w={44} />
        </Row>
      </Mod>
      <Mod x={390} y={1025} w={820} h={110} title="EXT LT">
        <Row gap={30} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <Toggle id="STROBE" />
          <Toggle id="BEACON" />
          <Toggle id="WING_LT" />
          <Toggle id="NAV_LOGO" />
          <Toggle id="RWY_TURNOFF" />
          <Toggle id="LAND_L" />
          <Toggle id="LAND_R" />
          <Toggle id="NOSE_LT" />
        </Row>
      </Mod>
      <Mod x={390} y={1145} w={220} h={100} title="APU">
        <Row gap={26} style={{ justifyContent: 'center' }}>
          <Pb id="APU_MASTER" />
          <Pb id="APU_START" />
        </Row>
      </Mod>
      <Mod x={620} y={1145} w={290} h={100} title="SIGNS">
        <Row gap={22} style={{ justifyContent: 'center' }}>
          <Toggle id="SEAT_BELTS" h={52} />
          <Toggle id="NO_SMOKING" h={52} />
          <Toggle id="EMER_EXIT_LT" h={52} />
        </Row>
      </Mod>
      <Mod x={920} y={1145} w={290} h={100} title="INT LT">
        <Row gap={12} style={{ justifyContent: 'center' }}>
          <Knob id="OVHD_INTEG" label="INTEG LT" size={28} />
          <Toggle id="DOME" h={52} />
          <Toggle id="ANN_LT" h={52} />
        </Row>
      </Mod>

      {/* ===================== правая колонка ===================== */}
      <Mod x={1220} y={10} w={370} h={100} title="FLT CTL">
        <Row gap={20} style={{ justifyContent: 'center' }}>
          <Pb id="ELAC2" />
          <Pb id="SEC2" />
          <Pb id="SEC3" />
          <Pb id="FAC2" />
        </Row>
      </Mod>
      <Mod x={1220} y={120} w={370} h={100} title="VENT">
        <Row gap={30} style={{ justifyContent: 'center' }}>
          <Pb id="BLOWER" />
          <Pb id="EXTRACT" />
          <Pb id="CAB_FANS" />
        </Row>
      </Mod>
      <Mod x={1220} y={230} w={370} h={100} title="ENG">
        <Row gap={20} style={{ justifyContent: 'center' }}>
          <Pb id="N1_MODE1" />
          <Pb id="ENG1_MAN_START" />
          <Pb id="ENG2_MAN_START" />
          <Pb id="N1_MODE2" />
        </Row>
      </Mod>
      <Mod x={1220} y={340} w={370} h={100} title="CARGO SMOKE">
        <Row gap={20} style={{ justifyContent: 'center' }}>
          <div className="light-box" style={{ width: 54, height: 30 }}>
            <div className="leg one c-red">FWD SMOKE</div>
          </div>
          <div className="light-box" style={{ width: 54, height: 30 }}>
            <div className="leg one c-red">AFT SMOKE</div>
          </div>
          <Pb id="CARGO_SMOKE_TEST" w={40} h={34} inner="TEST" />
        </Row>
      </Mod>
      <Mod x={1220} y={450} w={370} h={110} title="CARGO HEAT">
        <Row gap={24} style={{ justifyContent: 'center', alignItems: 'flex-end' }}>
          <Pb id="CARGO_ISOL" />
          <Pb id="CARGO_HOT_AIR" />
          <Knob id="CARGO_TEMP" ends={['C', 'H']} />
        </Row>
      </Mod>
      <Mod x={1220} y={570} w={370} h={130} title="WIPER">
        <Row gap={40} style={{ justifyContent: 'center' }}>
          <Pb id="RAIN_R" w={40} h={34} />
          <Rotary id="WIPER_R" size={36} />
        </Row>
      </Mod>
      <div className="placard" style={{ left: 1230, top: 720, width: 350 }}>
        A320-214 · MSN 0320
        <br />
        CFM56-5B4/3 · MTOW 78 000 KG
      </div>
    </div>
  );
}
