import { MUSCLES } from '../db/seed/muscles';
import { useState } from 'react';

interface Region { codes: string[]; view: 'front' | 'back'; path: string; mirror?: boolean }
// Regions are position guides on the generated classroom anatomy model, not a diagnostic atlas.
const REGIONS: Region[] = [
  { codes: ['delt_lateral'], view: 'front', path: 'M345 187 Q318 202 315 244 L329 278 Q350 253 359 210 Z', mirror: true },
  { codes: ['delt_front'], view: 'front', path: 'M369 180 Q345 192 336 225 L350 257 Q374 238 388 210 Z', mirror: true },
  { codes: ['chest_upper'], view: 'front', path: 'M383 185 Q421 187 459 190 L459 223 Q423 213 371 225 Z', mirror: true },
  { codes: ['chest_mid'], view: 'front', path: 'M369 229 Q417 219 459 228 L459 266 Q420 293 372 268 Z', mirror: true },
  { codes: ['chest_lower'], view: 'front', path: 'M374 270 Q414 289 459 270 L455 285 Q411 299 381 280 Z', mirror: true },
  { codes: ['biceps_long','biceps_short'], view: 'front', path: 'M335 269 Q313 275 308 329 L320 352 Q340 326 345 293 Z', mirror: true },
  { codes: ['brachialis'], view: 'front', path: 'M307 293 L300 339 L310 356 L315 326 Z', mirror: true },
  { codes: ['abs_rectus'], view: 'front', path: 'M425 292 Q442 286 458 292 L458 424 L424 419 Q412 367 425 292 Z', mirror: true },
  { codes: ['obliques'], view: 'front', path: 'M389 308 L414 314 L413 416 L389 423 Q379 374 389 308 Z', mirror: true },
  { codes: ['quads'], view: 'front', path: 'M385 565 L448 566 Q447 632 421 686 Q390 704 379 675 Q368 628 385 565 Z', mirror: true },
  { codes: ['delt_rear'], view: 'back', path: 'M952 188 Q930 201 927 239 L938 268 Q964 246 983 215 Z', mirror: true },
  { codes: ['traps_upper'], view: 'back', path: 'M1048 133 Q1025 160 980 180 L1037 203 L1063 178 Z', mirror: true },
  { codes: ['traps_mid'], view: 'back', path: 'M995 202 L1063 186 L1063 290 Q1036 277 995 202 Z', mirror: true },
  { codes: ['lat'], view: 'back', path: 'M976 257 Q1007 298 1049 305 L1060 343 L1016 393 Q987 374 976 257 Z', mirror: true },
  { codes: ['triceps'], view: 'back', path: 'M941 262 Q915 273 913 317 L925 346 Q949 331 956 294 Z', mirror: true },
  { codes: ['erector'], view: 'back', path: 'M1052 279 L1063 290 L1063 410 L1041 409 Q1039 361 1052 279 Z', mirror: true },
  { codes: ['glutes'], view: 'back', path: 'M1006 426 Q1030 417 1063 424 L1063 510 Q1034 546 995 518 Z', mirror: true },
  { codes: ['abductor'], view: 'back', path: 'M1003 420 L1020 430 L1004 476 L990 468 Z', mirror: true },
  { codes: ['hams'], view: 'back', path: 'M996 567 L1060 565 Q1049 635 1042 686 L1001 697 Q988 636 996 567 Z', mirror: true },
  { codes: ['calves'], view: 'back', path: 'M1002 720 Q1030 713 1043 750 Q1047 800 1022 833 L1000 836 Q981 800 1002 720 Z', mirror: true },
];

export function BodyAnatomy({ primaryMuscles, secondaryMuscles = [] }: { primaryMuscles: string[]; secondaryMuscles?: string[] }) {
  const [view, setView] = useState<'both' | 'front' | 'back'>('both');
  const names = (codes: string[]) => codes.map(code => MUSCLES.find(m => m.code === code)?.nameJa ?? code);
  return <section className="anatomy-card" aria-label="鍛える筋肉の位置">
    <div className="anatomy-heading"><h3>どこに効く？</h3><div className="anatomy-legend"><span><i className="primary-dot"/>主に使う</span><span><i className="secondary-dot"/>補助で使う</span></div></div>
    <div className="anatomy-switch" role="group" aria-label="人体図の表示">{(['both','front','back'] as const).map(v => <button key={v} aria-pressed={view===v} className={view===v?'selected':''} onClick={() => setView(v)}>{v==='both'?'前面・背面':v==='front'?'前面を拡大':'背面を拡大'}</button>)}</div>
    {view==='both' && <div className="anatomy-views"><span>前面</span><span>背面</span></div>}
    <svg viewBox={view==='both'?'0 0 1536 1024':view==='front'?'190 0 530 1024':'820 0 530 1024'} className="anatomy-image" role="img" aria-label={`主に使う筋肉：${names(primaryMuscles).join('、')}。補助：${names(secondaryMuscles).join('、')}`}>
      <image href={`${import.meta.env.BASE_URL}muscle-anatomy.png`} width="1536" height="1024"/>
      {REGIONS.map((region,index) => {
        const state = region.codes.some(c => primaryMuscles.includes(c)) ? 'primary' : region.codes.some(c => secondaryMuscles.includes(c)) ? 'secondary' : null;
        if (!state) return null;
        return <g key={index} className={`anatomy-highlight ${state}`}><title>{names(region.codes).join('・')}</title><path d={region.path}/>{region.mirror && <path d={region.path} transform={`translate(${region.view==='front'?932:2136},0) scale(-1,1)`}/>}</g>;
      })}
    </svg>
    <div className="muscle-labels"><p><span className="primary-label">主働</span>{names(primaryMuscles).join('・') || 'なし'}</p>{secondaryMuscles.length>0 && <p><span className="secondary-label">補助</span>{names(secondaryMuscles).join('・')}</p>}</div>
    <p className="anatomy-caption">色は部位の位置の目安です。お尻はショーツ上に表示しています。刺激の強さはフォームや器具で変わります。</p>
  </section>;
}
