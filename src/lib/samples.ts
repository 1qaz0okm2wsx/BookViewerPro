import { buildEpub } from "./epub";
import { makeCover } from "./cover";
import { uid } from "../types";
import type { BookMeta } from "../types";

const LUNYU = `第1章 学而

子曰：「学而时习之，不亦说乎？有朋自远方来，不亦乐乎？人不知而不愠，不亦君子乎？」

有子曰：「其为人也孝弟，而好犯上者，鲜矣；不好犯上，而好作乱者，未之有也。君子务本，本立而道生。孝弟也者，其为仁之本与！」

子曰：「巧言令色，鲜矣仁！」

曾子曰：「吾日三省吾身：为人谋而不忠乎？与朋友交而不信乎？传不习乎？」

子曰：「道千乘之国，敬事而信，节用而爱人，使民以时。」

子曰：「弟子入则孝，出则弟，谨而信，泛爱众，而亲仁。行有余力，则以学文。」

子夏曰：「贤贤易色；事父母，能竭其力；事君，能致其身；与朋友交，言而有信。虽曰未学，吾必谓之学矣。」

子曰：「君子不重则不威，学则不固。主忠信，无友不如己者，过则勿惮改。」

曾子曰：「慎终追远，民德归厚矣。」

子贡曰：「贫而无谄，富而无骄，何如？」子曰：「可也。未若贫而乐，富而好礼者也。」

子曰：「不患人之不己知，患不知人也。」

第2章 为政

子曰：「为政以德，譬如北辰，居其所而众星共之。」

子曰：「诗三百，一言以蔽之，曰：思无邪。」

子曰：「道之以政，齐之以刑，民免而无耻；道之以德，齐之以礼，有耻且格。」

子曰：「吾十有五而志于学，三十而立，四十而不惑，五十而知天命，六十而耳顺，七十而从心所欲，不逾矩。」

孟懿子问孝。子曰：「无违。」

子游问孝。子曰：「今之孝者，是谓能养。至于犬马，皆能有养；不敬，何以别乎？」

子夏问孝。子曰：「色难。有事，弟子服其劳；有酒食，先生馔，曾是以为孝乎？」

子曰：「温故而知新，可以为师矣。」

子曰：「君子不器。」

子贡问君子。子曰：「先行其言而后从之。」

子曰：「君子周而不比，小人比而不周。」

子曰：「学而不思则罔，思而不学则殆。」

子曰：「知之为知之，不知为不知，是知也。」

第3章 八佾（选）

孔子谓季氏：「八佾舞于庭，是可忍也，孰不可忍也？」

子曰：「人而不仁，如礼何？人而不仁，如乐何？」

林放问礼之本。子曰：「大哉问！礼，与其奢也，宁俭；丧，与其易也，宁戚。」

子曰：「君子无所争，必也射乎！揖让而升，下而饮，其争也君子。」

子夏问曰：「巧笑倩兮，美目盼兮，素以为绚兮。何谓也？」子曰：「绘事后素。」曰：「礼后乎？」子曰：「起予者商也！始可与言诗已矣。」

子曰：「管仲之器小哉！」或曰：「管仲俭乎？」曰：「管氏有三归，官事不摄，焉得俭？」

第4章 里仁（选）

子曰：「里仁为美。择不处仁，焉得知？」

子曰：「不仁者不可以久处约，不可以长处乐。仁者安仁，知者利仁。」

子曰：「唯仁者能好人，能恶人。」

子曰：「苟志于仁矣，无恶也。」

子曰：「富与贵，是人之所欲也；不以其道得之，不处也。贫与贱，是人之所恶也；不以其道得之，不去也。」

子曰：「君子之于天下也，无适也，无莫也，义之与比。」

子曰：「君子怀德，小人怀土；君子怀刑，小人怀惠。」

子曰：「见贤思齐焉，见不贤而内自省也。」

子曰：「父母在，不远游，游必有方。」

子曰：「君子欲讷于言而敏于行。」
`;

const DAODE = `# 道德经 · 上篇

> 老子著，传世本八十一章，此选前八章。

## 第一章

道可道，非常道；名可名，非常名。

无名，天地之始；有名，万物之母。

故常无欲，以观其妙；常有欲，以观其徼。

此两者同出而异名，同谓之玄。玄之又玄，众妙之门。

## 第二章

天下皆知美之为美，斯恶已；皆知善之为善，斯不善已。

故有无相生，难易相成，长短相形，高下相倾，音声相和，前后相随。

是以圣人处无为之事，行不言之教。万物作焉而不辞，生而不有，为而不恃，功成而弗居。夫唯弗居，是以不去。

## 第三章

不尚贤，使民不争；不贵难得之货，使民不为盗；不见可欲，使民心不乱。

是以圣人之治，虚其心，实其腹；弱其志，强其骨。常使民无知无欲，使夫智者不敢为也。为无为，则无不治。

## 第四章

道冲，而用之或不盈。渊兮，似万物之宗。

挫其锐，解其纷，和其光，同其尘。湛兮，似或存。

吾不知谁之子，象帝之先。

## 第五章

天地不仁，以万物为刍狗；圣人不仁，以百姓为刍狗。

天地之间，其犹橐龠乎？虚而不屈，动而愈出。

多言数穷，不如守中。

## 第六章

谷神不死，是谓玄牝。玄牝之门，是谓天地根。

绵绵若存，用之不勤。

## 第七章

天长地久。天地所以能长且久者，以其不自生，故能长生。

是以圣人后其身而身先，外其身而身存。非以其无私邪？故能成其私。

## 第八章

上善若水。水善利万物而不争，处众人之所恶，故几于道。

居善地，心善渊，与善仁，言善信，正善治，事善能，动善时。

夫唯不争，故无尤。
`;

const PROSE = [
  {
    title: "陋室铭 · 刘禹锡",
    html: `<p>山不在高，有仙则名。水不在深，有龙则灵。斯是陋室，惟吾德馨。</p>
<p>苔痕上阶绿，草色入帘青。谈笑有鸿儒，往来无白丁。可以调素琴，阅金经。无丝竹之乱耳，无案牍之劳形。</p>
<p>南阳诸葛庐，西蜀子云亭。孔子云：何陋之有？</p>
<blockquote>题解：刘禹锡（772—842），字梦得，唐代文学家。此文作于和州任上，以陋室自况，见志趣之高。</blockquote>`,
  },
  {
    title: "爱莲说 · 周敦颐",
    html: `<p>水陆草木之花，可爱者甚蕃。晋陶渊明独爱菊。自李唐来，世人甚爱牡丹。予独爱莲之出淤泥而不染，濯清涟而不妖，中通外直，不蔓不枝，香远益清，亭亭净植，可远观而不可亵玩焉。</p>
<p>予谓菊，花之隐逸者也；牡丹，花之富贵者也；莲，花之君子者也。噫！菊之爱，陶后鲜有闻。莲之爱，同予者何人？牡丹之爱，宜乎众矣！</p>
<blockquote>题解：周敦颐（1017—1073），北宋理学开山。托物言志，以莲自况。</blockquote>`,
  },
  {
    title: "记承天寺夜游 · 苏轼",
    html: `<p>元丰六年十月十二日夜，解衣欲睡，月色入户，欣然起行。念无与为乐者，遂至承天寺寻张怀民。怀民亦未寝，相与步于中庭。</p>
<p>庭下如积水空明，水中藻、荇交横，盖竹柏影也。何夜无月？何处无竹柏？但少闲人如吾两人者耳。</p>
<blockquote>题解：苏轼（1037—1101），字子瞻，号东坡居士。元丰六年贬黄州时作，八十余字而意境全出。</blockquote>`,
  },
];

const SVG_ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 560" width="800" height="560">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e9e4d4"/><stop offset="1" stop-color="#f6f2e6"/>
    </linearGradient>
    <linearGradient id="mist" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#9db3a6" stop-opacity="0"/><stop offset="1" stop-color="#9db3a6" stop-opacity=".55"/>
    </linearGradient>
  </defs>
  <rect width="800" height="560" fill="url(#sky)"/>
  <circle cx="600" cy="120" r="52" fill="#c6431f" opacity=".85"/>
  <path d="M0 320 Q120 200 260 300 T560 280 T800 310 L800 560 L0 560 Z" fill="#7d938a" opacity=".5"/>
  <path d="M0 380 Q180 260 340 360 T680 340 L800 360 L800 560 L0 560 Z" fill="#4d685e" opacity=".75"/>
  <path d="M0 450 Q220 340 420 430 T800 420 L800 560 L0 560 Z" fill="#24403a"/>
  <rect y="430" width="800" height="130" fill="url(#mist)"/>
  <g stroke="#1c2f29" stroke-width="3" fill="none" stroke-linecap="round">
    <path d="M180 470 q60 -18 120 0 q-60 14 -120 0 Z" fill="#1c2f29"/>
    <path d="M238 470 v-52 M238 418 q22 -14 40 -16 M238 430 q-18 -10 -30 -12"/>
  </g>
  <g stroke="#3c4f47" stroke-width="2.5" fill="none" stroke-linecap="round">
    <path d="M470 180 q14 -8 28 0 M515 165 q14 -8 28 0"/>
  </g>
  <text x="60" y="520" font-family="serif" font-size="26" fill="#1c2f29" letter-spacing="8">远山如黛 · 墨阁藏画</text>
  <rect x="700" y="480" width="44" height="44" fill="#c6431f" rx="4"/>
  <text x="722" y="511" font-family="serif" font-size="24" fill="#f6f2e6" text-anchor="middle">阁</text>
</svg>`;

function metaOf(title: string, author: string, format: BookMeta["format"], blob: Blob, cover?: string): BookMeta {
  return {
    id: uid(), title, author, format, size: blob.size,
    addedAt: Date.now(), source: "sample", cover,
  };
}

/** 首次启动时内置的示例书库（均为公有领域文本，运行时现场构建） */
export async function buildSamples(): Promise<Array<{ meta: BookMeta; blob: Blob }>> {
  const out: Array<{ meta: BookMeta; blob: Blob }> = [];

  const lunyuBlob = new Blob([LUNYU], { type: "text/plain;charset=utf-8" });
  out.push({
    meta: metaOf("论语选读", "孔子及弟子", "txt", lunyuBlob,
      await makeCover("论语选读", "孔子及弟子", "TXT")),
    blob: lunyuBlob,
  });

  const ddjBlob = new Blob([DAODE], { type: "text/markdown;charset=utf-8" });
  out.push({
    meta: metaOf("道德经 · 上篇", "老子", "md", ddjBlob,
      await makeCover("道德经", "老子", "MD")),
    blob: ddjBlob,
  });

  const cover = await makeCover("古典散文三则", "苏轼 等", "EPUB");
  const epubBlob = await buildEpub({
    title: "古典散文三则",
    author: "刘禹锡 · 周敦颐 · 苏轼",
    chapters: PROSE,
    version: 3,
    cover,
  });
  out.push({ meta: metaOf("古典散文三则", "刘禹锡 等", "epub", epubBlob, cover), blob: epubBlob });

  const svgBlob = new Blob([SVG_ART], { type: "image/svg+xml;charset=utf-8" });
  out.push({
    meta: metaOf("远山如黛 · 墨阁藏画", "墨阁画坊", "svg", svgBlob,
      await makeCover("远山如黛", "墨阁画坊", "SVG")),
    blob: svgBlob,
  });

  return out;
}
