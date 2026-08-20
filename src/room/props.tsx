/**
 * Movable decorative props (shop items with `surface`/`anchor` metadata).
 * Every prop's art is drawn at its CATALOG ANCHOR coordinates — RoomScene
 * wraps each in a translate group of (placement − anchor), so the same art
 * serves every position. Contact shadows live inside the group and move too.
 *
 * z-ordering is decided by RoomScene: floor props are painter-sorted by
 * where they stand; the rug lies flat under everything; desk props sit in
 * front of the computer except the dual monitor (behind it).
 */

const SHADOW = '#241a10';

function ContactShadow(props: { cx: number; cy: number; rx: number; ry: number; opacity?: number }) {
  return (
    <ellipse
      cx={props.cx}
      cy={props.cy}
      rx={props.rx}
      ry={props.ry}
      fill={SHADOW}
      opacity={props.opacity ?? 0.16}
      shapeRendering="geometricPrecision"
    />
  );
}

export const PROP_ART: Record<string, () => JSX.Element> = {
  room_mug: () => (
    <>
      <rect x="48" y="79" width="8" height="7" fill="#e7e2d8" />
      <rect x="48" y="79" width="8" height="2" fill="#f3efe6" />
      <rect x="56" y="81" width="2" height="3" fill="#cfc9bd" />
      <rect className="scene-steam" x="49" y="76" width="2" height="2" fill="#d8d2c6" opacity="0.7" />
      <rect className="scene-steam" x="52" y="75" width="2" height="2" fill="#d8d2c6" opacity="0.5"
        style={{ animationDelay: '1.4s' }} />
    </>
  ),

  room_keyboard: () => (
    <>
      <rect x="60" y="83" width="40" height="4" fill="#2f2c29" />
      {[62, 66, 70, 74, 78, 82, 86, 90, 94].map((x) => (
        <rect key={x} x={x} y="84" width="2" height="2" fill="#d8d2c6" />
      ))}
    </>
  ),

  room_lamp: () => (
    <>
      <rect x="111" y="82" width="10" height="4" fill="#555" />
      <rect x="111" y="82" width="10" height="1" fill="#6a6a6a" />
      <rect x="115" y="62" width="2" height="20" fill="#555" />
      <polygon points="107,56 125,56 121,64 111,64" fill="#f2c14e" />
      <rect x="113" y="63" width="6" height="2" fill="#fff6d0" />
    </>
  ),

  room_dualmon: () => (
    <>
      <rect x="28" y="50" width="24" height="26" fill="#2a2a30" />
      <rect x="29" y="51" width="22" height="1" fill="#43434c" />
      <rect x="31" y="53" width="18" height="20" fill="#4f8fd0" />
      <rect x="33" y="57" width="12" height="2" fill="#bfe0ff" />
      <rect x="33" y="62" width="14" height="2" fill="#9ccaf5" />
      <rect x="33" y="67" width="9" height="2" fill="#bfe0ff" />
      <rect x="38" y="76" width="4" height="8" fill="#3b3b42" />
      <rect x="33" y="84" width="14" height="2" fill="#3b3b42" />
    </>
  ),

  room_cat: () => (
    <>
      <ellipse cx="106" cy="86" rx="9" ry="2" fill={SHADOW} opacity="0.16"
        shapeRendering="geometricPrecision" />
      <rect x="98" y="74" width="16" height="12" fill="#8a8076" />
      <rect x="98" y="74" width="16" height="2" fill="#9a9086" />
      <polygon points="98,74 101,68 104,74" fill="#8a8076" />
      <polygon points="108,74 111,68 114,74" fill="#8a8076" />
      <rect className="scene-cat-tail" x="89" y="79" width="9" height="3" fill="#8a8076" />
      <rect className="scene-cat-eye" x="101" y="78" width="2" height="3" fill="#2c2c2c" />
      <rect className="scene-cat-eye" x="108" y="78" width="2" height="3" fill="#2c2c2c" />
      <rect x="104" y="81" width="3" height="2" fill="#caa0a0" />
    </>
  ),

  room_plant: () => (
    <>
      <ContactShadow cx={20} cy={119} rx={13} ry={3} opacity={0.14} />
      <rect x="14" y="88" width="12" height="18" fill="#4f8a4f" />
      <rect x="8" y="94" width="10" height="12" fill="#5fa05f" />
      <rect x="22" y="92" width="10" height="14" fill="#46824a" />
      <rect x="16" y="84" width="8" height="8" fill="#5fa05f" />
      <rect x="12" y="106" width="16" height="12" fill="#c2724a" />
      <rect x="10" y="103" width="20" height="4" fill="#d98a62" />
    </>
  ),

  room_bookshelf: () => (
    <>
      <ContactShadow cx={146} cy={99} rx={14} ry={3} opacity={0.14} />
      <rect x="135" y="54" width="22" height="44" fill="#6b4a30" />
      <rect x="135" y="54" width="22" height="2" fill="#7e5a3b" />
      <rect x="137" y="56" width="18" height="2" fill="#7c5836" />
      <rect x="137" y="70" width="18" height="2" fill="#5a3e28" />
      <rect x="137" y="84" width="18" height="2" fill="#5a3e28" />
      <rect x="138" y="59" width="3" height="11" fill="#c4704f" />
      <rect x="142" y="60" width="3" height="10" fill="#5f9a5f" />
      <rect x="146" y="58" width="3" height="12" fill="#5f8cb8" />
      <rect x="150" y="60" width="4" height="10" fill="#cf962a" />
      <rect x="138" y="74" width="4" height="10" fill="#5f8cb8" />
      <rect x="143" y="73" width="3" height="11" fill="#c4704f" />
      <rect x="147" y="75" width="3" height="9" fill="#cf962a" />
      <rect x="151" y="74" width="3" height="10" fill="#5f9a5f" />
    </>
  ),

  room_rug: () => (
    <>
      <ellipse cx="80" cy="122" rx="46" ry="15" fill={SHADOW} opacity="0.06"
        shapeRendering="geometricPrecision" />
      <rect x="38" y="106" width="84" height="30" fill="#b5654a" />
      <rect x="44" y="111" width="72" height="20" fill="#cf7d5f" />
      <rect x="44" y="111" width="72" height="2" fill="#e0a184" />
      <rect x="44" y="129" width="72" height="2" fill="#9c4f38" />
    </>
  ),

  room_posters: () => (
    <>
      <rect x="112" y="16" width="18" height="24" fill="#3a3530" />
      <rect x="114" y="18" width="14" height="20" fill="#d98a62" />
      <rect x="117" y="22" width="8" height="8" fill="#f2c14e" />
      <rect x="136" y="22" width="16" height="20" fill="#3a3530" />
      <rect x="138" y="24" width="12" height="16" fill="#6f9ec0" />
      <rect x="140" y="30" width="8" height="2" fill="#fff" />
      <rect x="140" y="34" width="6" height="2" fill="#fff" />
    </>
  ),
};
