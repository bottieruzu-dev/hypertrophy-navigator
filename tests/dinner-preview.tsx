// Synthetic visual fixture; no personal data, cloud config, or database writes.
import { createRoot } from 'react-dom/client';
import { DinnerProposalContent } from '../src/components/DinnerSuggestions';
import type { DinnerProposal } from '../src/engine/dinner';
import '../src/styles.css';
const proposal: DinnerProposal={version:1,date:'2026-10-23',summary:'表示確認用の架空の献立です。タンパク質を補いながら、夕食全体の量を調整する3案。',assumptions:['表示テスト用です。記載の栄養値はすべて架空の数値で、実際の献立や商品を評価したものではありません。','体脂肪率・腹囲は未記録。今日の栄養にも一部不明があります。'],options:[
  {title:'豆腐と野菜のレンジ蒸し＋ごはん',mode:'microwave',minutes:15,foods:['豆腐 150g','冷凍野菜 150g','パックごはん 1個'],steps:['食品の包装表示に従って、電子レンジ対応容器で加熱する。','温まり具合を確認し、盛り付ける。'],nutrients:{energy_kcal:480,protein_g:25,fat_g:12,carbs_g:65,fiber_g:6,salt_g:1.5},reason:'用意しやすい食材を組み合わせた表示サンプルです。',evidence:'架空のテスト数値。実際には分量と商品表示で確認します。'},
  {title:'コンビニでそろえる夕食セット',mode:'ready',minutes:5,foods:['サラダチキン 1パック','おにぎり 1個','野菜のおかず 1パック'],steps:['食べる量と商品の栄養表示を確認する。'],nutrients:{energy_kcal:450,protein_g:30,fat_g:10,carbs_g:60,fiber_g:5,salt_g:2},reason:'調理せずに組み合わせられる案の表示サンプルです。',evidence:'架空のテスト数値。商品は未指定です。'},
  {title:'BASE FOODを使う手軽な組み合わせ',mode:'ready',minutes:5,foods:['BASE FOODの商品 1食分（表示を確認）','無糖ヨーグルト 150g'],steps:['商品の1食分と栄養表示を確認する。'],nutrients:{energy_kcal:500,protein_g:28,fat_g:15,carbs_g:60,fiber_g:null,salt_g:1},reason:'食品を組み合わせる案の表示サンプルです。',evidence:'架空のテスト数値。未確認項目は不明として表示します。'},
]};
if(import.meta.env.MODE==='test') createRoot(document.getElementById('root')!).render(<main className="page nutrition-page" style={{maxWidth:390}}><section className="card dinner-section"><p className="eyebrow">DINNER · 22:00 · 架空データ</p><h1>今夜の調整ごはん</h1><DinnerProposalContent result={{proposal,generatedAt:'2026-10-23T13:02:00Z'}}/></section></main>);
