import type { MaintenanceTask } from "./types";
export type VerifiedSuggestion = Pick<MaintenanceTask, "name" | "kind" | "intervalDays" | "sourceKind" | "sourceUrl"> & { frequency: string; conditions: string };
export type ProductCandidate = { maker: string; name: string; modelNumber: string; categoryId: string; productUrl: string; manualUrl: string; discoveredManualUrl?: string; productLinkLabel?: string; manualLinkLabel?: string; verifiedAt: string; releaseYear?: number; releaseSourceUrl?: string; lookupNote?: string; suggestions: VerifiedSuggestion[] };

// Curated model-specific evidence. Future search providers must return candidates
// with citations for human verification; generated text never enters this catalog.
export const catalog: ProductCandidate[] = [{
  maker: "SHARP", name: "加湿空気清浄機", modelNumber: "KI-RX75", categoryId: "air-purifier",
  productUrl: "https://jp.sharp/kuusei/products/kirx75/",
  manualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx75_mn.pdf",
  discoveredManualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx75_mn.pdf",
  verifiedAt: "2026-10-01",
  suggestions: [{ name: "使い捨て加湿プレフィルター交換", kind: "交換", intervalDays: 30,
    frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式",
    sourceUrl: "https://jp.sharp/kuusei/products/kirx75/feature/maintenance/",
    conditions: "加湿空気清浄運転で1日2.5L使用した場合の目安。水質・使用環境によって早まることがあります。" }],
}, {
  maker: "SHARP", name: "加湿空気清浄機", modelNumber: "KI-RX100", categoryId: "air-purifier",
  productUrl: "https://jp.sharp/kuusei/products/kirx100/",
  manualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf",
  discoveredManualUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf",
  verifiedAt: "2026-10-02",
  suggestions: [
    { name: "本体・後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=29",
      conditions: "取扱説明書29ページ。運転を停止して電源プラグを抜き、柔らかい布で拭きます。本体・後ろパネルは水洗いしないでください。" },
    { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=29",
      conditions: "取扱説明書29ページ。運転を停止して電源プラグを抜き、センサー部のほこりを掃除機で取り除きます。" },
    { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書",
      sourceUrl: "https://jp.sharp/restricted/support/manual/air_purifier/kirx100_mn.pdf#page=30",
      conditions: "取扱説明書30ページ。運転を停止して電源プラグを抜き、水洗いします。汚れや臭いが気になる場合の洗剤・つけ置き手順は説明書を確認してください。" },
  ],
}];
// Shared manuals explicitly list both models on their covers. Do not infer siblings.
const humidifierManuals = [
  { models: ["HV-T55", "HV-T75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvt55_75.mn_.pdf" },
  { models: ["HV-R55", "HV-R75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvr55_75_mn.pdf" },
  { models: ["HV-S55", "HV-S75"], url: "https://jp.sharp/restricted/support/manual/humid_con/hvs55_s75_mn.pdf" },
  { models: ["HV-P55", "HV-P75"], url: "https://jp.sharp/support/humid_con/doc/hvp55-hvp75_mn.pdf" },
];
for (const { models, url } of humidifierManuals) {
  for (const modelNumber of models) {
    catalog.push({
      maker: "SHARP", name: "加熱気化式加湿器", modelNumber, categoryId: "humidifier",
      productUrl: "https://jp.sharp/support/humid_con/download.html", manualUrl: url,
      productLinkLabel: "公式説明書一覧", manualLinkLabel: "取扱説明書",
      verifiedAt: "2026-10-09",
      lookupNote: "この品番を掲載した公式説明書の14〜16ページで周期を確認済みです。水質・使用環境や汚れによって、目安より早くお手入れしてください。",
      suggestions: [
        { name: "エアフィルターの掃除", kind: "掃除", intervalDays: 14,
          frequency: "2週間に1回程度（予定計算は14日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=15`,
          conditions: "説明書15ページ。停止してファン停止後に電源プラグを抜き、ほこりを掃除機で取り除きます。汚れが目立つ場合の水洗い・乾燥方法は説明書で確認してください。" },
        { name: "加湿フィルター・給水トレー・トレーカバーの掃除", kind: "掃除", intervalDays: 14,
          frequency: "2週間に1回程度（予定計算は14日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=16`,
          conditions: "説明書16ページ。停止してファン停止後に電源プラグを抜き、取り外して水で洗います。加湿フィルターをブラシでこすらないでください。汚れ・においが残る場合の手順は説明書で確認してください。" },
        { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
          frequency: "1か月に1回程度（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=15`,
          conditions: "説明書15ページ。停止してファン停止後に電源プラグを抜き、柔らかい布で拭きます。本体は水洗いしないでください。" },
      ],
    });
  }
}
const washerManual = "https://panasonic.jp/p-db/contents/manualdl/1428456489512.pdf";
for (const modelNumber of ["NA-LX129CL", "NA-LX129CR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: washerManual, manualUrl: washerManual,
    productLinkLabel: "品番を確認できる公式説明書", manualLinkLabel: "取扱説明書",
    verifiedAt: "2026-10-09",
    lookupNote: "公式説明書の表紙に左右開き両品番が掲載されています。46ページの周期を確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（48ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerManual}#page=24`,
        conditions: "説明書の印刷46ページ（PDF24ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerManual}#page=24`,
        conditions: "説明書の印刷46〜47ページ（PDF24ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
    ],
  });
}

const washerDManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/671/523/000000002671523/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8-NA-LX129D-.pdf";
for (const modelNumber of ["NA-LX129DL", "NA-LX129DR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn240827-3", manualUrl: washerDManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2024, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn240827-3", verifiedAt: "2026-10-09",
    lookupNote: "2024年10月上旬発売の公式発表。D型公式説明書の表紙に左右開き両品番が掲載されています。46ページの周期を確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（48ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=24`,
        conditions: "説明書の印刷46ページ（PDF24ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=24`,
        conditions: "説明書の印刷46〜47ページ（PDF24ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerDManual}#page=25`,
        conditions: "印刷49ページ（PDF25ページ）。運転終了後、先に脱水して槽の水を抜き、容器で残水を受けてからゴミを取ります。ブザーが鳴る場合や運転中は外さないでください。取り付けは説明書に従い確実に締め、サイン表示時は予定前でも確認してください。" },
    ],
  });
}

const washerEManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/642/443/000000003642443/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8_NA-LX129E.pdf";
const washerEGuide = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/642/461/000000003642461/%E3%81%94%E4%BD%BF%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89_NA-LX129E.pdf";
for (const modelNumber of ["NA-LX129EL", "NA-LX129ER"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn250819-2", manualUrl: washerEManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2025, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn250819-2", verifiedAt: "2026-10-09",
    lookupNote: "2025年10月上旬発売の公式発表。E型公式説明書の表紙に左右開き両品番が掲載されています。槽は印刷36〜37ページ（PDF19）、排水フィルターと自動投入は別冊ご使用ガイド5・7ページで確認済みです。乾燥フィルターは乾燥・スチーム使用のたびに確認してください（別冊7ページ）。使用回数を日数に置き換える自動提案はしません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerEManual}#page=19`,
        conditions: "説明書の印刷36ページ（PDF19ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerEManual}#page=19`,
        conditions: "説明書の印刷36〜37ページ（PDF19ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerEGuide}#page=7`,
        conditions: "別冊ご使用ガイド7ページ。運転終了後、先に脱水して槽の水を抜き、容器で残水を受けてからゴミを取ります。ブザーが鳴る場合や運転中は外さないでください。取り付けは説明書に従い確実に締め、サイン表示時は予定前でも確認してください。" },
      { name: "自動投入タンク・経路のお手入れ", kind: "掃除", intervalDays: 90,
        frequency: "3か月ごと（予定計算は90日）・長期不使用や剤変更時", sourceKind: "取扱説明書", sourceUrl: `${washerEGuide}#page=5`,
        conditions: "別冊ご使用ガイド5〜6ページ。1か月以上使わなかったときや、洗剤の銘柄・選べるタンクの剤を変えるときも実施します。衣類を入れず、タンクを洗って自動投入お手入れを選びます。井戸水の場合のクエン酸や経路詰まり時の操作はガイドで確認してください。" },
    ],
  });
}

const washerFManual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/498/732/000000004498732/%E5%8F%96%E6%89%B1%E8%AA%AC%E6%98%8E%E6%9B%B8_NA-LX129F.pdf";
const washerFGuide = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/498/753/000000004498753/%E3%81%94%E4%BD%BF%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89_NA-LX129F.pdf";
for (const modelNumber of ["NA-LX129FL", "NA-LX129FR"]) {
  catalog.push({
    maker: "Panasonic", name: "ドラム式洗濯乾燥機", modelNumber, categoryId: "washer",
    productUrl: "https://news.panasonic.com/jp/press/jn260820-1", manualUrl: washerFManual,
    productLinkLabel: "品番・発売時期を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2026, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn260820-1", verifiedAt: "2026-10-09",
    lookupNote: "2026年10月上旬発売の公式発表。F型説明書で左右開き両品番と槽のお手入れ（印刷36〜37／PDF19）を確認しました。別冊6ページの排水フィルター、7ページのサブフィルターも確認済みです。乾燥糸くずボックスは乾燥のたび・サイン時、円筒フィルターはゴミ付着やサイン・U04時に確認します。自動投入タンクは内部の汚れ・洗剤や選べるタンクの剤の種類変更時（別冊5ページ）。これらの条件を固定日数には換算しません。",
    suggestions: [
      { name: "ドラムの槽乾燥", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFManual}#page=19`,
        conditions: "説明書の印刷36ページ（PDF19ページ）。衣類を入れず、水栓を開け、お手入れの槽乾燥コースを選びます。詳しい操作は説明書で確認してください。" },
      { name: "ドラムの黒カビ・におい予防", kind: "掃除", intervalDays: 30,
        frequency: "月1回程度・槽洗浄サイン表示時（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${washerFManual}#page=19`,
        conditions: "説明書の印刷36〜37ページ（PDF19ページ）。予防用のお手入れコースを説明書で選んでください。約60℃槽カビクリーンは洗浄剤を入れません。他の槽洗浄コースの薬剤・操作は説明書を確認し、衣類を入れないでください。サインが出た場合は予定日前でも実施してください。" },
      { name: "排水フィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週1回程度・お手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFGuide}#page=6`,
        conditions: "別冊ご使用ガイド6ページ。先に脱水して槽の水を抜き、タオルなどで残水を受け、残水が出ないことを確認して引き出します。ゴムパッキンがずれた場合は戻し、ガイドの取り付け方に従い確実に固定してください。運転中に外したり、外したまま運転しないでください。サイン時は予定前でも確認します。" },
      { name: "乾燥用サブフィルターの掃除", kind: "掃除", intervalDays: 7,
        frequency: "週に1回程度・サブフィルターお手入れサイン表示時（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${washerFGuide}#page=7`,
        conditions: "別冊ご使用ガイド7ページ。運転終了後、乾燥糸くずボックスを取り出してから、本体側とサブフィルターを絞ったタオルなどで拭きます。ガイドに従い差し込み、カチッと押して戻してください。サイン時は予定前でも確認します。運転中は取り出さず、フィルター網目を強く押さえないでください。" },
    ],
  });
}

// EE-DD35 and EE-DD50 are explicitly listed on the same manual cover.
const steamManual = "https://www.zojirushi.co.jp/toiawase/TR_PDF/EEDD.pdf";
for (const modelNumber of ["EE-DD35", "EE-DD50"]) {
  catalog.push({
    maker: "象印", name: "スチーム式加湿器", modelNumber, categoryId: "humidifier",
    productUrl: "https://www.zojirushi.co.jp/syohin/life/humidifier/ee-dd/", manualUrl: steamManual,
    productLinkLabel: "公式製品ページ", manualLinkLabel: "取扱説明書", verifiedAt: "2026-10-09",
    lookupNote: "公式説明書の表紙に両品番が掲載されています。印刷18〜19ページ（PDF10ページ）の内容器洗浄とパッキン交換の目安を確認済みです。内容器洗浄は1〜2か月の幅があるため、予定は短い側の30日で計算します。水質・使用状況や汚れによって早めてください。",
    suggestions: [
      { name: "内容器のクエン酸洗浄", kind: "掃除", intervalDays: 30,
        frequency: "1〜2か月に1回（予定計算は短い側の30日）", sourceKind: "取扱説明書", sourceUrl: `${steamManual}#page=10`,
        conditions: "印刷18ページ（PDF10ページ）。クエン酸洗浄コースを使います。開始前と終了後の排水は本体が冷めてから行い、洗剤・塩素系製品と混ぜないでください。分量・操作・すすぎは説明書で確認してください。汚れ・におい・運転音が気になる場合は予定前でも実施してください。" },
      { name: "内ぶたパッキンの交換", kind: "交換", intervalDays: 365,
        frequency: "1年を目安（予定計算は365日）・白い変色時は早めに交換", sourceKind: "取扱説明書", sourceUrl: `${steamManual}#page=10`,
        conditions: "印刷19ページ（PDF10ページ）。内ぶたパッキンは消耗品です。白く変色した場合は1年を待たずに交換してください。電源を抜いて冷ましてから、適合部品と取り外し・取り付け方法を説明書で確認してください。" },
    ],
  });
}

// Release years and model covers are verified separately from maintenance intervals.
// These six manuals each explicitly cover both 35 and 50 variants.
const recentSteamManuals = [
  { family: "DE", year: 2024 }, { family: "DF", year: 2025 }, { family: "DG", year: 2026 },
  { family: "RT", year: 2024 }, { family: "RU", year: 2025 }, { family: "RV", year: 2026 },
];
for (const { family, year } of recentSteamManuals) {
  const code = `EE${family}`;
  const url = `https://www.zojirushi.co.jp/toiawase/TR_PDF/${code}.pdf`;
  const supportUrl = `https://www.zojirushi.co.jp/toiawase/manual/${code.toLowerCase()}35-${code.toLowerCase()}50/`;
  for (const capacity of [35, 50]) {
    catalog.push({
      maker: "象印", name: "スチーム式加湿器", modelNumber: `EE-${family}${capacity}`, categoryId: "humidifier",
      productUrl: supportUrl, manualUrl: url, productLinkLabel: "品番・発売年を確認できる公式ページ", manualLinkLabel: "取扱説明書",
      releaseYear: year, releaseSourceUrl: supportUrl, verifiedAt: "2026-10-09",
      lookupNote: `${year}年発売。公式説明書の表紙で対象品番、印刷18・20ページ（PDF10・11ページ）で洗浄・交換の目安を確認済みです。洗浄の1〜2か月という幅を、予定計算では短い側の30日にしています。`,
      suggestions: [
        { name: "内容器のクエン酸洗浄", kind: "掃除", intervalDays: 30,
          frequency: "1〜2か月に1回（予定計算は短い側の30日）", sourceKind: "取扱説明書", sourceUrl: `${url}#page=10`,
          conditions: "印刷18ページ（PDF10ページ）。専用のクエン酸洗浄コースを使います。塩素系洗剤と混ぜないでください。開始前と終了後の排水は本体が冷めてから行い、分量・操作・すすぎはこの品番の説明書で確認してください。水質や使用状況、汚れ・におい・運転音によっては予定前に実施してください。" },
        { name: "内ぶたパッキンの交換", kind: "交換", intervalDays: 365,
          frequency: "1年を目安（予定計算は365日）・白い変色時は早めに交換", sourceKind: "取扱説明書", sourceUrl: `${url}#page=11`,
          conditions: "印刷20ページ（PDF11ページ）。消耗品のため1年を目安に交換します。白く変色した場合は1年を待たず交換してください。電源を抜いて冷ましてから、適合部品と取り付け方法をこの品番の説明書で確認してください。" },
      ],
    });
  }
}

// Both TX variants are explicitly listed in this shared 2024 manual.
const txManual = "https://jp.sharp/restricted/support/manual/air_purifier/kitx100_tx75_mn.pdf";
const txRelease = "https://corporate.jp.sharp/news/240903-a.html";
for (const modelNumber of ["KI-TX100", "KI-TX75"]) {
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: txRelease, manualUrl: txManual, discoveredManualUrl: txManual,
    productLinkLabel: "品番・発売日を確認できる公式発表", manualLinkLabel: "取扱説明書",
    releaseYear: 2024, releaseSourceUrl: txRelease, verifiedAt: "2026-10-09",
    lookupNote: "2024年9月12日発売。共通説明書の表紙に両品番を掲載。23〜26ページで月ごとのお手入れを確認済みです。給水のたび・運転時間による表示・汚れやにおいの条件は、日数に置き換えず説明書で確認してください。",
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=24`,
        conditions: "説明書24ページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=24`,
        conditions: "説明書24〜25ページ。停止して電源プラグを抜き、水洗いします。フィルターを分解せず、フロートを外さないでください。汚れ・においがある場合は予定前でも実施し、洗剤・すすぎ・加湿内部洗浄の操作は説明書で確認してください。" },
      { name: "後ろパネル・センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${txManual}#page=26`,
        conditions: "説明書26ページ。停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れが残る場合の洗浄方法は説明書を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// The UX manual independently confirms the 2025 models and monthly intervals.
const uxManual = "https://jp.sharp/restricted/support/manual/air_purifier/kiux100-ux75_mn.pdf";
const uxRelease = "https://jp.sharp/support/air_purifier/lineup/";
for (const modelNumber of ["KI-UX100", "KI-UX75"]) {
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: uxRelease, manualUrl: uxManual, discoveredManualUrl: uxManual,
    productLinkLabel: "型番・年度を確認できる公式一覧", manualLinkLabel: "取扱説明書",
    releaseYear: 2025, releaseSourceUrl: uxRelease, verifiedAt: "2026-10-09",
    lookupNote: "公式一覧の2025年度モデル。共通説明書の表紙に両品番を掲載。23〜26ページで月ごとのお手入れを確認済みです。給水のたび・運転時間による表示・汚れやにおいの条件は、日数に置き換えず説明書で確認してください。",
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=24`,
        conditions: "説明書24ページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=24`,
        conditions: "説明書24〜25ページ。停止して電源プラグを抜き、水洗いします。フィルターに力を加えず、フロートを外さないでください。汚れ・においがある場合は予定前でも実施し、洗剤・すすぎ・加湿内部洗浄の操作は説明書で確認してください。" },
      { name: "後ろパネル・センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${uxManual}#page=26`,
        conditions: "説明書26ページ。停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れが残る場合の洗浄方法は説明書を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// Each model's official support page links to the care index used below.
const sharpCareBase = "https://jp.sharp/support/air_purifier/mt_doc/";
for (const [modelNumber, releaseYear] of [["KI-TX70", 2024], ["KI-UX70", 2025], ["KI-WX70", 2026], ["KI-WX75", 2026], ["KI-WX100", 2026]] as const) {
  const large = modelNumber === "KI-WX75" || modelNumber === "KI-WX100";
  const modelSupport = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: modelSupport, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: modelSupport, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年9月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、内容と周期を確認しています。タンクは給水のたび、集じん・脱臭フィルターは汚れや吹出口のにおいが気になるときに確認してください。これらの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai_01.html`,
        conditions: "公式お手入れページ。停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスター付きの場合はキャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${large ? "filter_humi_care06" : "filter_humi_care03"}.html`,
        conditions: large
          ? "停止して電源プラグを抜き、水洗いします。トレーシキリとローラーも洗い、フロートは外さないでください。使い捨て加湿プレフィルターは汚れていれば交換し、フィルターに力を入れすぎないでください。白色の面を本体正面側にして、公式の図で取り付けを確認します。汚れ・におい時は予定前でも確認してください。"
          : "停止して電源プラグを抜き、水洗いします。加湿フィルターを分解せず、フロートは外さないでください。汚れた使い捨て加湿プレフィルターは交換してください。お手入れ後のランプ消灯操作と、汚れ・においが残る場合のつけ置き方法は公式の図で確認します。汚れ・におい時は予定前でも確認してください。" },
      ...(large ? [
        { name: "センサー部のお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}sensor_care05.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・におい時にセンサーフィルターを水洗いしたら、十分乾かしてから取り付けてください。" },
        { name: "後ろパネルのお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}panel_care03.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。パネルに力を加えすぎないでください。汚れ・においがある場合の洗浄は公式案内に従い、十分すすいで陰干しします。" },
      ] : [
        { name: "後ろパネル・センサー部のお手入れ", kind: "掃除" as const, intervalDays: 30,
          frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式" as const, sourceUrl: `${sharpCareBase}sensor_panel_care02.html`,
          conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・においがある場合の洗浄方法は公式案内を確認し、洗った部品は十分乾かして取り付けてください。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
      ]),
    ],
  });
}

// S50 variants have their own explicitly linked care routes.
for (const [modelNumber, releaseYear] of [["KI-TS50", 2024], ["KI-US50", 2025], ["KI-WS50", 2026]] as const) {
  const newer = modelNumber !== "KI-TS50";
  const support = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: support, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: support, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年9月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、内容と周期を確認しています。タンクは給水のたび、集じん・脱臭フィルターは汚れや吹出口のにおいが気になるときに確認してください。これらの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai_01.html`,
        conditions: "停止して電源プラグを抜き、柔らかい布で拭きます。本体は水洗いせず、キャスター付きの場合はキャスターも確認してください。" },
      { name: "加湿フィルター・トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${newer ? "filter_humi_care07" : "filter_humi_care01"}.html`,
        conditions: newer
          ? "停止して電源プラグを抜き、水洗いします。加湿フィルターに力を加えすぎず、フロートは外さないでください。汚れた使い捨て加湿プレフィルターは交換してください。お手入れ後のランプ消灯と取り付け操作は公式の図で確認します。汚れ・におい時は予定前でも確認してください。"
          : "停止して電源プラグを抜き、水洗いします。加湿フィルターはトレーに入れたまま持ち運び、分解して洗わないでください。汚れた使い捨て加湿プレフィルターは交換してください。汚れ・においが残る場合のつけ置きと、お手入れ後のランプ消灯は公式案内で確認します。予定前でも汚れを確認してください。" },
      { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}${newer ? "sensor_care06" : "sensor_care01"}.html`,
        conditions: "停止して電源プラグを抜き、センサー部のほこりを掃除機で吸い取ります。詳しい位置は機種別の公式案内で確認してください。" },
      { name: "後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}panel_care01.html`,
        conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。パネルに力を加えすぎないでください。ひどい汚れの洗浄は公式案内に従い、洗剤を十分すすいで陰干しします。集じん・脱臭フィルターは水洗い・天日干ししないでください。" },
    ],
  });
}

// The official pages for all three D50 variants link explicitly to care_kild50.
for (const [modelNumber, releaseYear] of [["KI-SD50", 2024], ["KI-TD50", 2025], ["KI-UD50", 2026]] as const) {
  const support = `https://cs.sharp.co.jp/select/contents?productId=${modelNumber}`;
  catalog.push({
    maker: "SHARP", name: "除加湿空気清浄機", modelNumber, categoryId: "air-purifier",
    productUrl: support, productLinkLabel: "発売時期・お手入れの公式案内",
    manualUrl: `https://jp.sharp/support/download/members/?productId=${modelNumber}`, manualLinkLabel: "品番別の説明書を探す",
    releaseYear, releaseSourceUrl: support, verifiedAt: "2026-10-09",
    lookupNote: `${releaseYear}年4月発売と公式機種別サポートに掲載。機種別の公式お手入れ案内で、加湿・除湿トレーを含む内容と周期を確認しています。集じん・脱臭一体型フィルターは汚れや吹出口のにおいが気になるときに確認し、水洗い・天日干ししないでください。汚れの条件を固定日数に置き換えません。`,
    suggestions: [
      { name: "本体のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}care_hontai.html`,
        conditions: "停止して電源プラグを抜き、柔らかい布で拭きます。本体の水洗いや分解清掃はしないでください。キャスター付きの場合はキャスターも確認します。" },
      { name: "加湿フィルター・加湿／除湿トレーのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）・汚れやにおいが気になるとき", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}kild50/filter_humi_care_kild50.html`,
        conditions: "停止して電源プラグを抜き、トレーの水を捨ててから加湿フィルターと上段の加湿トレー・下段の除湿トレーを水洗いします。加湿フィルターは分解しないでください。フックやキャップ、ハンドルの戻し方と、清掃後のリセットボタン操作は公式の図で確認します。汚れ・におい時は予定前でも確認してください。" },
      { name: "センサー部のお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}sensor_care04.html`,
        conditions: "停止して電源プラグを抜き、操作部のニオイセンサーと本体側面の温度・湿度センサーのほこりを掃除機で取ります。温度・湿度センサーのフィルターを水洗いした場合は十分に乾かしてください。詳しい位置は公式の図で確認します。" },
      { name: "後ろパネルのお手入れ", kind: "掃除", intervalDays: 30,
        frequency: "約1か月に1回（予定計算は30日）", sourceKind: "メーカー公式", sourceUrl: `${sharpCareBase}panel_care02.html`,
        conditions: "停止して電源プラグを抜き、ほこりを掃除機で取ります。汚れ・においがある場合の洗浄は公式案内に従い、台所用中性洗剤を十分すすいで陰干しします。一体型の集じん・脱臭フィルターを水洗いしないでください。" },
    ],
  });
}

const nx500Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/904/130/000000003904130/MC-NX500K.pdf";
catalog.push({
  maker: "Panasonic", name: "セパレート型コードレススティック掃除機", modelNumber: "MC-NX500K", categoryId: "vacuum",
  productUrl: "https://panasonic.jp/soji/products/MC-NX500K.html",
  manualUrl: nx500Manual, discoveredManualUrl: nx500Manual, productLinkLabel: "公式製品ページ", manualLinkLabel: "取扱説明書（PDF）", verifiedAt: "2026-10-09",
  releaseYear: 2025, releaseSourceUrl: "https://news.panasonic.com/jp/topics/206494",
  lookupNote: "メーカー発表は2025年12月中旬発売。説明書16〜17ページの月1回の紙パック確認を提案します。交換は赤い紙パック交換ランプの約2秒間隔の点滅時で、点灯は保護装置のお知らせです。純正S型紙パックAMC-U2を使用し、紙パックケースは捨てないでください。ダストボックス・プレフィルターは吸込力が回復しないときなど、ノズル・排気口・クリーンフィルターは吸込力低下や汚れが気になるときのお手入れで、固定周期は設定していません。説明書18〜21ページを確認してください。床用ノズル全体は水洗い不可、取り外した回転ブラシは水洗い可能です。内部センサーはランプのつき方がおかしいときに柔らかい布で乾拭きします。",
  suggestions: [{ name: "紙パックのゴミのたまり具合を確認", kind: "点検", intervalDays: 30,
    frequency: "月1回（特にペットの毛や綿ゴミが多いとき。予定計算は30日）", sourceKind: "取扱説明書", sourceUrl: `${nx500Manual}#page=9`,
    conditions: "説明書16〜17ページ。ペットの毛や綿ゴミは、いっぱいでも交換ランプが点滅しない場合があるため、直接確認します。交換は赤いランプが約2秒間隔で点滅したとき。月ごとの一律交換ではありません。点灯や約0.3秒間隔の早い点滅は交換サインと異なり、説明書24ページで対処を確認してください。紙パック交換後は本体を充電台にセットし直します。" }],
});

const tz500Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/139/000000002409139/np-tz500.pdf";
catalog.push({
  maker: "Panasonic", name: "食器洗い乾燥機", modelNumber: "NP-TZ500", categoryId: "dishwasher",
  productUrl: "https://panasonic.jp/dish/products/NP-TZ500.html", productLinkLabel: "公式製品ページ",
  manualUrl: tz500Manual, discoveredManualUrl: tz500Manual, manualLinkLabel: "取扱説明書（PDF）",
  verifiedAt: "2026-10-09", releaseYear: 2024, releaseSourceUrl: "https://news.panasonic.com/jp/press/jn240510-2",
  lookupNote: "メーカー発表は2024年6月下旬発売。現在の機種専用説明書11〜12ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。汚れが気になる場合は予定前でもお手入れしてください。洗剤は食洗機専用を使用し、庫内清掃に塩素系洗剤を使わないでください。タンク・投入経路は洗剤の種類を変えるときや1か月以上使わなかったときにもお手入れします。具体的な操作や部品の戻し方は公式の図で確認してください。",
  suggestions: [
    { name: "残さいフィルターの掃除", kind: "掃除", intervalDays: 7,
      frequency: "週に1回・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、残さいフィルターを取り外して掃除します。お手入れ後は取り外した部品を元どおりに取り付けてください。排水口に残る水は異常ではありません。" },
    { name: "庫内のお手入れ", kind: "掃除", intervalDays: 15,
      frequency: "月に2〜3回（予定計算は15日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。食器を入れず、食洗機専用液体洗剤の自動投入を使用し、汚れレベルL5で運転します。塩素系洗剤は使用しないでください。操作の順番と洗剤補充の確認は説明書を参照し、運転終了後は分岐水栓を閉めます。" },
    { name: "排水口カバーの掃除", kind: "掃除", intervalDays: 30,
      frequency: "月に1回（予定計算は30日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、取り外した排水口カバーを中性洗剤を含ませた柔らかいスポンジで洗います。元どおりに取り付けてください。" },
    { name: "本体・パッキン部のお手入れ", kind: "掃除", intervalDays: 30,
      frequency: "月に1回（予定計算は30日）・汚れが気になるとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=6`,
      conditions: "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤を使わず、水や湯を庫内に入れたり製品にかけたりしないでください。" },
    { name: "洗剤タンク・洗剤投入経路のお手入れ", kind: "掃除", intervalDays: 90,
      frequency: "3か月ごと（予定計算は90日）・洗剤変更時・1か月以上使わなかったとき", sourceKind: "取扱説明書", sourceUrl: `${tz500Manual}#page=7`,
      conditions: "説明書12〜13ページ。残った洗剤の排出方法を確認し、取り外したタンクとフロートを約40℃のお湯で洗います。水や湯以外で洗わないでください。部品を正しく戻して約40℃のお湯を入れ、お手入れモード1で経路を洗います。モード2は詰まり時の対処、モード3は洗剤排出であり、通常清掃と混同しないでください。操作順と分岐水栓の開閉は公式の図を確認します。" },
  ],
});

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "食器洗い乾燥機",
    "modelNumber": "NP-TH5",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TH5.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn240510-2",
    "lookupNote": "メーカー発表は2024年6月下旬発売。現在の説明書11〜13ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。念入りな庫内清掃には80℃すすぎを選べます。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。フィルターAのみ下かごを取り付けたまま取り外せます。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書13ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けてお手入れコースで運転します。洗いの途中の2回の停止は蒸気で汚れを浮かすためです。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "食器洗い乾燥機",
    "modelNumber": "NP-TA5",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TA5.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn240510-2",
    "lookupNote": "メーカー発表は2024年6月下旬発売。現在の説明書11〜13ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。80℃すすぎはこの機種の機能ではありません。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。フィルターAのみ下かごを取り付けたまま取り外せます。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書12ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/409/137/000000002409137/np-th5_np-ta5.pdf#page=7",
        "conditions": "説明書13ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けてお手入れコースで運転します。洗いの途中の2回の停止は蒸気で汚れを浮かすためです。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "スリムタイプ食器洗い乾燥機",
    "modelNumber": "NP-TSK2",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TSK2.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf",
    "discoveredManualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-09",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn250821-4",
    "lookupNote": "メーカー発表は2025年10月中旬発売。現在の説明書10〜12ページを確認しています。庫内の月2〜3回は予定計算を15日にしています。気になる汚れは予定前でもお手入れしてください。食洗機専用洗剤を使用し、塩素系洗剤は使用しないでください。念入りな庫内清掃には80℃すすぎを選べます。自動投入タンクの清掃は提案していません。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書10ページ。運転終了後30分以上たってから電源プラグを抜き、フィルターを取り外してAとBに分け、柔らかいブラシなどで掃除します。元どおり取り付け、カチッと音がするまで回してください。下かごは左に回転させるか取り外してから作業します。"
      },
      {
        "name": "排水口カバーの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、下かごと残さいフィルターを取り出してカバーを外します。中性洗剤を含ませた柔らかいスポンジで洗い、元どおりに取り付けます。"
      },
      {
        "name": "本体・パッキン部のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=6",
        "conditions": "説明書11ページ。運転終了後30分以上たってから電源プラグを抜き、よく絞った柔らかい布で庫内やパッキン部を拭きます。パッキンは引っぱらないでください。外側は漂白剤・洗剤・溶剤・ワックス・殺虫剤などを使わず、水や湯を庫内に入れたり製品にかけたりしないでください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）・汚れが気になるとき",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/634/037/000000003634037/np-tsk2.pdf#page=7",
        "conditions": "説明書12ページ。食器を入れず、通常の目安量の2倍の食洗機専用洗剤を入れ、分岐水栓を開けて汚れレベルL3で運転します。粉末・液体は約10g、タブレットは大きさにより個数が異なります。塩素系洗剤は使用しないでください。運転終了後は分岐水栓を閉めます。パッキン部など洗浄水の当たらない箇所は別途拭き掃除します。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// The official shared manual explicitly names all four opening variants.
const fridge2025Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/742/771/000000003742771/NR-C37WS2_C37WS2L_C33JS2_C33JS2L_ARAH0A108880_%E6%B4%BB%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89.pdf";
for (const modelNumber of ["NR-C33JS2", "NR-C33JS2L", "NR-C37WS2", "NR-C37WS2L"]) {
  const ws = modelNumber.includes("C37WS2");
  const productModel = ws ? "NR-C37WS2" : "NR-C33JS2";
  catalog.push({
    maker: "Panasonic", name: "冷凍冷蔵庫", modelNumber, categoryId: "fridge",
    productUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, manualUrl: fridge2025Manual,
    productLinkLabel: "左右開き品番を確認できる公式製品情報", manualLinkLabel: "取扱説明書（活用ガイド）",
    releaseYear: 2025, releaseSourceUrl: ws ? "https://news.panasonic.com/jp/topics/206395" : "https://news.panasonic.com/jp/press/jn250821-1", verifiedAt: "2026-10-09",
    lookupNote: "2025年10月発売シリーズ。共通公式説明書の表紙で左右開き4品番を確認済みです。印刷15〜17ページで周期を確認しました。液だれ・汚れはすぐに拭き、モイスチャーコントロールプレート／フィルターは汚れが気になるときに清掃します。条件付き清掃は固定日数にしません。物理的な清掃は電源プラグを抜き、再接続まで7分以上待ってください。製氷皿の自動清掃時は電源が必要です。",
    suggestions: [
      { name: "給水タンク・浄水フィルターの水洗い", kind: "掃除", intervalDays: 7, frequency: "週1回（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。電源プラグを抜き、タンク・フィルター・フタのパッキングを外してやさしく水洗いします。水道水以外を使う場合はぬめりやカビが発生しやすいため、さらにこまめに水洗いしてください。" },
      { name: "ガラストレイ・わけられるん棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜き、説明書の取り外し図に従って清掃します。重いガラス棚の落下・破損に注意。取り外せない仕切棚は柔らかい布で拭きます。落ちにくい汚れには薄めた台所用中性洗剤を使い、水拭きしてください。" },
      { name: "ドア棚・ボトル棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜いて清掃。ボトル棚の前に上のドア棚を外し、取り付けは水平に差し込んで押し下げます。固く絞った布を使い、水分をすき間に入れないでください。" },
      { name: "パーシャル・野菜室・冷凍室ケースの清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。電源プラグを抜き、部品別の取り外し図に従います。レールの潤滑剤は拭き取らないでください。水洗い後は水滴を拭き、冷凍室上段ケース・小物野菜ケースはFRONTを前にして戻します。" },
      { name: "製氷皿の自動水洗い", kind: "掃除", intervalDays: 180, frequency: "年1〜2回（予定計算は180日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=8`,
        conditions: "印刷15ページ（PDF8）。製氷皿は取り外せません。電源を入れた状態でタンクに水だけを入れ、冷凍室上段ケースの氷を空にして製氷停止ボタンを10秒以上押します。清掃中（約3分）は冷凍室ドアを開けず、終了後に排出された水を捨てて拭き取ります。" },
      { name: "電源プラグ・冷蔵庫周囲・脚カバーのほこり取り", kind: "掃除", intervalDays: 365, frequency: "年1回（予定計算は365日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷16ページ（PDF9）。電源プラグを抜き、背面・壁面・床などのすき間のほこりを取り除きます。脚カバーは説明書4ページの方法で外します。床の保護や転倒防止など移動時の注意を確認し、無理に動かさないでください。" },
      { name: "製氷用浄水フィルターの交換", kind: "交換", intervalDays: 1095, frequency: "約3年を目安（予定計算は1095日）", sourceKind: "取扱説明書", sourceUrl: `${fridge2025Manual}#page=9`,
        conditions: "印刷17ページ（PDF9）。浄水フィルターは約3年が交換目安です。水あかなどが詰まると製氷できない場合があります。既に使用している場合は使用開始日を基に予定を調整し、交換部品は説明書22ページで確認してください。" },
    ],
  });
}

// The official shared manual explicitly names all four opening variants.
const fridgeEs2025Manual = "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/487/471/000000003487471/NR-C37ES2_C37ES2L_C33ES2_C33ES2L_ARAH0A108600_%E6%B4%BB%E7%94%A8%E3%82%AC%E3%82%A4%E3%83%89.pdf";
for (const modelNumber of ["NR-C33ES2", "NR-C33ES2L", "NR-C37ES2", "NR-C37ES2L"]) {
  const large = modelNumber.includes("C37ES2");
  const productModel = large ? "NR-C37ES2" : "NR-C33ES2";
  catalog.push({
    maker: "Panasonic", name: "冷凍冷蔵庫", modelNumber, categoryId: "fridge",
    productUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, manualUrl: fridgeEs2025Manual,
    productLinkLabel: "左右開き品番を確認できる公式製品情報", manualLinkLabel: "取扱説明書（活用ガイド）",
    releaseYear: 2025, releaseSourceUrl: `https://panasonic.jp/reizo/products/${productModel}.html`, verifiedAt: "2026-10-09",
    lookupNote: "2025年7月発売シリーズ。共通公式説明書の表紙で左右開き4品番を確認済みです。印刷11〜13ページで周期を確認しました。液だれ・汚れはすぐに拭き、モイスチャーコントロールプレート／フィルターは汚れが気になるときに清掃します。条件付き清掃は固定日数にしません。物理的な清掃は電源プラグを抜き、再接続まで7分以上待ってください。製氷皿の自動清掃時は電源が必要です。",
    suggestions: [
      { name: "給水タンク・浄水フィルターの水洗い", kind: "掃除", intervalDays: 7, frequency: "週1回（予定計算は7日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。電源プラグを抜き、タンク・フィルター・フタのパッキングを外してやさしく水洗いします。水道水以外を使う場合はぬめりやカビが発生しやすいため、さらにこまめに水洗いしてください。" },
      { name: "ガラストレイ・わけられるん棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜き、説明書の取り外し図に従って清掃します。重いガラス棚の落下・破損に注意。取り外せない仕切棚は柔らかい布で拭きます。落ちにくい汚れには薄めた台所用中性洗剤を使い、水拭きしてください。" },
      { name: "ドア棚・ボトル棚の清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜いて清掃。ボトル棚の前に上のドア棚を外し、取り付けは水平に差し込んで押し下げます。固く絞った布を使い、水分をすき間に入れないでください。" },
      { name: "チルドルーム・野菜室・冷凍室ケースの清掃", kind: "掃除", intervalDays: 90, frequency: "3か月に1回（予定計算は90日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。電源プラグを抜き、部品別の取り外し図に従います。レールの潤滑剤は拭き取らないでください。水洗い後は水滴を拭き、冷凍室上段ケース・小物野菜ケースはFRONTを前にして戻します。" },
      { name: "製氷皿の自動水洗い", kind: "掃除", intervalDays: 180, frequency: "年1〜2回（予定計算は180日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=6`,
        conditions: "印刷11ページ（PDF6）。製氷皿は取り外せません。電源を入れた状態でタンクに水だけを入れ、冷凍室上段ケースの氷を空にして製氷を停止してから、製氷停止ボタンを10秒以上押します。清掃中（約3分）は冷凍室ドアを開けず、終了後に排出された水を捨てて拭き取ります。" },
      { name: "電源プラグ・冷蔵庫周囲・脚カバーのほこり取り", kind: "掃除", intervalDays: 365, frequency: "年1回（予定計算は365日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷12ページ（PDF7）。電源プラグを抜き、背面・壁面・床などのすき間のほこりを取り除きます。脚カバーは説明書4ページの方法で外します。床の保護や転倒防止など移動時の注意を確認し、無理に動かさないでください。" },
      { name: "製氷用浄水フィルターの交換", kind: "交換", intervalDays: 1095, frequency: "約3年を目安（予定計算は1095日）", sourceKind: "取扱説明書", sourceUrl: `${fridgeEs2025Manual}#page=7`,
        conditions: "印刷13ページ（PDF7）。浄水フィルターは約3年が交換目安です。水あかなどが詰まると製氷できない場合があります。既に使用している場合は使用開始日を基に予定を調整し、交換部品は説明書18ページで確認してください。" },
    ],
  });
}

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc62x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc54x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式製品情報",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC49X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/rei/lineup/rhwc49x/",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.hitachi.co.jp/New/cnews/month/2025/01/0116.pdf",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年1月下旬発売の公式発表と、共通説明書の表紙で3品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC62X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXCC専用の共通説明書の表紙で2品番を確認済みです。39〜40ページの清掃周期を確認しました。41ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。 カメラは汚れが気になるときに柔らかい布でほこりを拭き取ります（39ページ）。日数の定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書42ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、HXCC専用の共通説明書の表紙で2品番を確認済みです。39〜40ページの清掃周期を確認しました。41ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。 カメラは汚れが気になるときに柔らかい布でほこりを拭き取ります（39ページ）。日数の定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書42ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VWC57X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC57X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC57X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、VWC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VWC50X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC50X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VWC50X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と、VWC専用の共通説明書の表紙で2品番を確認済みです。35〜36ページの清掃周期を確認しました。37ページの製氷おそうじは初回使用時・1週間以上不使用後の条件付きです。通電した状態で製氷ボタンを5秒以上押し、終了する約4分間は全てのドアを開けません。この条件を日数の定期予定には変換しません。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書39ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vwc57x_a.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GZC67X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GZC67X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GZC67X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年2月発売の公式サポート情報と専用説明書の表紙を確認済みです。39〜40ページの周期に基づく候補です。電動引き出しは食品が落ちた・挟まった・汁がたまったときに電源プラグを抜き、柔らかい乾いた布で清掃します。水をかけず、分解せず、リンク部を動かさないでください（40ページ）。この条件を日数の定期予定には変換しません。製氷おそうじは初回・1週間以上不使用後のみ。通電状態で全てのドアを閉め、MENUをタッチして表示を点灯後、Ice Makerを5秒以上タッチし、終了する約4分間はドアを開けません（41ページ）。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書43ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gzc67x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年5月発売の公式サポートと専用説明書を確認済み。41〜42ページの周期を提案します。カメラは気になるとき柔らかい布で清掃（41ページ）。電動引き出しは異物や汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（42ページ）。製氷おそうじは初回・1週間不使用後、通電状態で製氷を5秒以上押し、約4分全ドアを閉めます（43ページ）。これら条件付き作業は定期予定にしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書44ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67x_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年5月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74x_a.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

export function normalizeModel(value: string) {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[‐‑‒–—−ー]/g, "-").replace(/\s+/g, "");
}
export function lookupModel(value: string) {
  const model = normalizeModel(value);
  // Exact matching only: similar product numbers do not establish applicability.
  return catalog.filter((candidate) => normalizeModel(candidate.modelNumber) === model);
}


// Links are discovery aids only. Search results never become verified suggestions.
export function officialSearchLinks(value: string) {
  const model = normalizeModel(value);
  if (!/^[A-Z0-9][A-Z0-9-]{1,79}$/.test(model)) return [];
  return [
    { maker: "SHARP", domain: "jp.sharp" },
    { maker: "Panasonic", domain: "panasonic.jp" },
    { maker: "日立", domain: "kadenfan.hitachi.co.jp" },
    { maker: "象印", domain: "zojirushi.co.jp" },
    { maker: "三菱電機", domain: "mitsubishielectric.co.jp" },
    { maker: "ダイキン", domain: "daikin.co.jp" },
  ].map(({ maker, domain }) => ({ maker, url: `https://www.google.com/search?q=${encodeURIComponent(`site:${domain} "${model}" 取扱説明書 お手入れ`)}` }));
}


// R-H54X/R-H49X: own shared manual cover and pages 23–27 verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年4月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年4月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54x_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// HWS47X/XL: shared manual cover and care diagrams independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47x_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// V38X/XL and V32X/XL: own manual cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32X",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32X/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32X/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32XL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32XL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32XL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2025年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38x_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);




// R-27X: own cover and care pages 10/11 verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27X",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27X/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27X/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2025年9月発売の公式サポートとR-27X専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27x_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});



// R-H54XG: dedicated manual independently verified, pages 23–27 and 35.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-H54XG",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54XG/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54XG/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2025年10月発売の公式サポートと、R-H54XGを明記した専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
  "suggestions": [
    {
      "name": "給水タンク・浄水フィルターの水洗い",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "週に1回（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
    },
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "特鮮氷温ルームの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・側面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
    },
    {
      "name": "製氷用浄水フィルターの交換",
      "kind": "交換",
      "intervalDays": 1095,
      "frequency": "約3〜4年が目安（予定計算は1095日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54xg_b.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
    }
  ]
});



// R-H54WY/R-H49WY: dedicated manual cover and pages 23–27 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54WY",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54WY/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54WY/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49WY",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49WY/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49WY/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54wy_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// R-H54W/R-H49W: own manual independently verified, pages 23–27/35.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54w_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// HWS47V/VL: own cover and care diagrams independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年10月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年10月発売の公式サポートと、右開き・左開き両品番を明記したHWS専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、27ページの方法でケースを外してぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケースを水洗いした場合は裏返して排水し、十分に水分を拭き取ります。歯ブラシ・たわしなど毛足の長いものを使わず、レールの潤滑剤を拭き取らないでください。食洗機や熱湯は使わないでください。 野菜室のプラチナ触媒は取り外さず、水洗いしないでください（26ページ）。下段ケースの取り外し前にしきりを外し、再装着は27ページの向き・固定方法を確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// V38V/VL and V32V/VL: dedicated cover and pages 16–18/23 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年9月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38v_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// R-27V: own manual cover and printed care pages 10/11 independently verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27V",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27V/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27V/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2024年10月発売の公式サポートとR-27V専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27v_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});

// R-HS47V/VL: dedicated manual cover and pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HS47V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年6月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HS47VL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47VL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HS47VL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年6月発売の公式サポートと、両品番を明記した共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hs47v_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HWC62Y/54Y/49Y: own manual cover and pages 35–39/50 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC62Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC62Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC62Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWC49Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC49Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWC49Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、3品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書38ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hwc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HZC62Y/54Y: dedicated cover and care pages 35–39/50 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HZC62Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC62Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC62Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、2品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。電源プラグを抜き、食品を出し、38ページの図に従ってケースを外し、アルミトレイ・真空容器・パッキングと受け部をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、LED庫内灯部分はやさしく拭いてください。パッキングの汚れがひどいときは柔らかいスポンジなどで水洗いし、水分を拭き取り自然乾燥させます（汚れ時のみで別の定期予定にはしません）。取り付け後はパッキングの緩みやケースのがたつきを確認し、ハンドルを下げてロックしてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HZC54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HZC54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年2月発売の各公式サポートと、2品番を明記した専用共通説明書を確認済み。35〜36ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（37ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。電源プラグを抜き、食品を出し、38ページの図に従ってケースを外し、アルミトレイ・真空容器・パッキングと受け部をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、LED庫内灯部分はやさしく拭いてください。パッキングの汚れがひどいときは柔らかいスポンジなどで水洗いし、水分を拭き取り自然乾燥させます（汚れ時のみで別の定期予定にはしません）。取り付け後はパッキングの緩みやケースのがたつきを確認し、ハンドルを下げてロックしてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書38ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。電源プラグを抜き、食品を出して38〜39ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=35",
        "conditions": "説明書35ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hzc62y_b_00.pdf#page=36",
        "conditions": "説明書36ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書50ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-H54Y/49Y: dedicated cover and care pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年4月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従ってケースを外して、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面からの水垂れに注意してください。下段ケースを水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものは使わず、ケースや引き出しレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年4月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従ってケースを外して、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面からの水垂れに注意してください。下段ケースを水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものは使わず、ケースや引き出しレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54y_a_01.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

// R-HWS47Y/YL: dedicated cover and pages 23–27/35 independently verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従って外してぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。ケース背面からの水垂れに注意し、水洗い後は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HWS47YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HWS47YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、両品番を明記した専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出し、26〜27ページの図に従って外してぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。ケース背面からの水垂れに注意し、水洗い後は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hws47y_a.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// V Y: own four-model cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V38YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V38YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、冷凍室ドアを開けて脚カバーを上に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32Y",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32Y/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32Y/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-V32YL",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32YL/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-V32YL/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2026年8月発売の各公式サポートと、4品番を明記したV型専用説明書を確認済み。16・18ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。17ページの製氷おそうじは初回・1週間以上不使用後のみ。通電状態でタンク満水・正しい位置、貯氷コーナーが空かを確認し、冷蔵室以外を閉めて自動製氷ボタンを5秒以上押します。音と点滅を確認して冷蔵室も閉め、約3分全ドアを開けません。終了後の排水は17ページの図に従ってください。製氷皿は取り外せず、機械部には手を入れないでください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。 ミネラルウォーター・井戸水・浄水器の水・湯冷ましなど塩素を含まない水を使う場合は3日に1回に予定を調整してください。ふたは後側から取り付け、すき間なく平行に閉めます（18ページ）。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書7・9ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、部品の取り外しは7・9ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、部品を取り外さないでください。移動方法と取り付けは図で確認してください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_v38y_a.pdf#page=18",
        "conditions": "説明書18ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書23ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
 ] satisfies ProductCandidate[]);



// R27Y own cover and care diagrams verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-27Y",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27Y/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27Y/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2026年8月発売の公式サポートとR-27Y専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
  "suggestions": [
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27y_a.pdf#page=10",
      "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
    }
  ]
});



// KW57YJ: dedicated cover and pages23–27/35 verified.
catalog.push({
  "maker": "日立",
  "productLinkLabel": "公式説明書一覧",
  "name": "冷凍冷蔵庫",
  "modelNumber": "R-KW57YJ",
  "categoryId": "fridge",
  "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KW57YJ/manual.html",
  "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KW57YJ/manual.html",
  "verifiedAt": "2026-10-09",
  "lookupNote": "2026年10月発売の公式サポートとR-KW57YJ専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）で定期予定にはしません。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後は説明書の図に従って排水し、タオルを取り除きます。機械部に手を入れないでください。物理的なお手入れは電源プラグを抜いて行ってください。",
  "suggestions": [
    {
      "name": "給水タンク・浄水フィルターの水洗い",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "週に1回（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
    },
    {
      "name": "ドア表面の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
    },
    {
      "name": "ドアパッキングの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
    },
    {
      "name": "汁受け部の清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
    },
    {
      "name": "特鮮氷温ルームの清掃",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "月に1回（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。食品を出し、ケースを外してぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、取り外し・取り付けは説明書26ページの図に従ってください。 ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。"
    },
    {
      "name": "棚・ポケットの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "収納ケースの清掃",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従ってケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。切替室の下段ケースを外す前にしきりを外してください。取り付け時はしきりの「R」を正面右下にし、ケースに最後まで入れます。下段ケース背面から水がたれる場合があるので注意し、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
    },
    {
      "name": "電源プラグのほこり取り",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
    },
    {
      "name": "冷蔵庫の背面・側面・床の清掃",
      "kind": "掃除",
      "intervalDays": 180,
      "frequency": "年に1〜2回（予定計算は180日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=23",
      "conditions": "説明書23ページ。電源プラグを抜き、6ページの図に従って脚カバーを外し調節脚を床から浮かせ、冷蔵庫を手前に引き出して清掃します。傷つきやすい床は板などで保護してください。"
    },
    {
      "name": "製氷用浄水フィルターの交換",
      "kind": "交換",
      "intervalDays": 1095,
      "frequency": "約3〜4年が目安（予定計算は1095日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kw57yj_a.pdf#page=24",
      "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
    }
  ]
});



// HW V own three-model cover and care pages verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HW49V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW49V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HW49V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、3品番を明記したHW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず、水洗いしないでください。下段ケースを外す前にしきりを外します。取り付け時はしきりの「R」を正面右下にして最後まで入れます。下段ケース背面からの水垂れに注意し、水洗いした場合は裏返して排水し十分に乾かします。歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hw62v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



// VW V own two-model cover and care diagrams verified.
catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VW57V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW57V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW57V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したVW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室・冷凍室下段の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースは「手前 FRONT」を手前にし、冷凍室下段はスリットのある方を手前にします。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-VW50V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW50V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-VW50V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したVW V専用説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は25ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。電源プラグを抜き、食品を出して26ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、食品を出して27ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室・冷凍室下段の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースは「手前 FRONT」を手前にし、冷凍室下段はスリットのある方を手前にします。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_vw57v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXC V専用説明書を確認済み。39〜40ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（41ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は41ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。電源プラグを抜き、食品を出して43ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書54ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXC54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXC54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXC V専用説明書を確認済み。39〜40ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（41ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は41ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。電源プラグを抜き、食品を出して42ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書42ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。電源プラグを抜き、食品を出して43ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=39",
        "conditions": "説明書39ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxc62v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書54ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC62V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC62V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-HXCC54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-HXCC54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の各公式サポートと、2品番を明記したHXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は水洗いしないでください。説明書にない部品は取り外さないでください。野菜室の下段ケースを外す前にしきりを外します。しきりの「R」を正面右下にして最後まで取り付けます。野菜室の上段ケースは「手前 FRONT」を手前にします。冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットしてください。野菜室下段ケースを水洗いした場合は裏返して排水し十分に乾かします。下段ケース背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_hxcc62v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H54V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H54V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年1月発売の公式サポートと、両品番を明記したH V専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。 冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットします。野菜室の上段ケースは「手前 FRONT」を手前にし、取り付け後はハンドルを持って操作し正しく取り付けたことを確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-H49V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-H49V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年1月発売の公式サポートと、両品番を明記したH V専用共通説明書を確認済み。23〜24ページの周期を提案します。製氷おそうじは初回・1週間以上不使用後のみ（25ページ）。通電状態で給水タンクを満水・正しい位置にセットし、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は説明書の図に従い、機械部に手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書26ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。電源プラグを抜き、26〜27ページの図に従って食品を出しケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室下段ケース背面から水がたれる場合があるため注意してください。ケース類や引き出しレールの潤滑剤を拭き取らず、食洗機や熱湯を使わないでください。 冷凍室下段の小物ケースは「手前 FRONT」とスリットのある方を手前にし、左右のつめを大物ケースの外側にセットします。野菜室の上段ケースは「手前 FRONT」を手前にし、取り付け後はハンドルを持って操作し正しく取り付けたことを確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=23",
        "conditions": "説明書23ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_h54v_b.pdf#page=24",
        "conditions": "説明書24ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書35ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-KXCC57V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KXCC57V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-KXCC57V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと、品番を明記したKXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従ってケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。上下の切替室は下段ケースを外す前に必ずしきりを外してください。しきりの「R」を正面右下にして最後まで取り付けます。上段ケースの「手前 FRONT」を手前にし、冷凍室はスリットのある方も手前にします。切替室は取り付け後に上段ケースを左右にスライドさせ正しい取り付けを確認してください。下段ケース背面から水がたれる場合に注意し、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_kxcc57v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。 真空チルドケースは44ページの図に従い最後にハンドルを下げてロックします。真空チルドルームと野菜室のプラチナ触媒は取り外さず、水洗いしないでください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。 野菜室の下段ケースを外す前にしきりを外し、しきりの「R」を正面右下にして最後まで取り付けます。上段ケースと冷凍室下段の小物ケースは「手前 FRONT」を手前にし、小物ケースはスリットのある方を手前にします。説明書にない部品を取り外さないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74v_b.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67V",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67V/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67V/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年2月発売の公式サポートと、品番を明記したGXCC V専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。 電動引き出しは異物・汁があるとき電源プラグを抜き、42ページの図に従いケースを外して乾拭きします。ユニットに水をかけず、分解やリンク操作をしないでください。定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず水洗いしないでください。下段ケースを外す前に必ずしきりを外し、再装着時はしきりの「PLATINUM」を図の向きに合わせて取り付けます。下段ケースはしきりを付けずに本体へ入れないでください。上段ケースの「手前 FRONT」を手前にし、冷凍室下段の小物ケースはスリットも手前、左右のつめは大物ケースの外側にします。下段ケースを水洗いした場合は裏返して排水し十分乾燥させます。背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67v_b.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-WXC74W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-WXC74W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと専用説明書を確認済み。40〜43ページの周期を提案します。電動引き出しは異物・汁があるとき電源プラグを抜き乾拭きし、水かけ・分解・リンク操作をしません（41ページ）。製氷おそうじは初回・1週間不使用後、全ドア閉鎖→MENU点灯→製氷を5秒以上タッチ→約4分ドアを開けない手順です（42ページ）。条件付き作業は定期化しません。製氷皿は43ページの停止設定・復帰手順に従ってください。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "真空チルドルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して44ページの方法でケースを外し、ぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、天井のLED部分はやさしく拭きます。パッキングの汚れがひどいときは柔らかいスポンジで水洗いし、水気を拭き自然乾燥させます。取り付け後はパッキングのゆるみやケースのがたつきがないか確認してください。 パッキングの取り付け溝を拭き、6か所の突起に合わせて取り付けます。詳しい脱着手順は41ページの図を確認してください。 真空チルドケースは44ページの図に従い最後にハンドルを下げてロックします。真空チルドルームと野菜室のプラチナ触媒は取り外さず、水洗いしないでください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書45ページの方法で外して拭きます。プラチナ触媒は水洗い禁止。野菜室下段ケースを水洗いした場合は裏返して排水し乾かします。歯ブラシやたわしを使わず、レールの潤滑剤を拭き取らないでください。 野菜室の下段ケースを外す前にしきりを外し、しきりの「R」を正面右下にして最後まで取り付けます。上段ケースと冷凍室下段の小物ケースは「手前 FRONT」を手前にし、小物ケースはスリットのある方を手前にします。説明書にない部品を取り外さないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=40",
        "conditions": "説明書40ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書57ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      },
      {
        "name": "製氷皿の水洗い",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_wxc74w_a.pdf#page=43",
        "conditions": "説明書43ページ。MENUをタッチして表示を点灯し、製氷をタッチして製氷停止を点灯させます。点滅中は約1分待ち、点灯してから取り外します。皿を空にして流水で軽く洗い、スポンジ・クレンザーを使わず表面を傷つけないでください。図に従い再装着してフレームの固定を確認し、MENU点灯後に製氷へ戻します。停止設定をせずに取り外さないでください。"
      }
    ]
  },
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-GXCC67W",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67W/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-GXCC67W/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2024年11月発売の公式サポートと、品番を明記したGXCC W専用説明書を確認済み。41〜42ページの周期を提案します。カメラは汚れが気になるときに電源プラグを抜き、柔らかい布でほこりなどを拭き取ります（41ページ）。定期予定にはしません。製氷おそうじは初回・1週間以上不使用後のみ（43ページ）。通電状態でタンク満水・正しい位置、氷を取り除き、冷蔵室以外のドアを閉めて製氷ボタンを5秒以上押します。冷蔵室も閉め、約4分終了まで全ドアを開けません。終了後の排水は43ページの図に従ってください。機械部には手を入れないでください。条件付きのため定期予定にはしません。 電動引き出しは異物・汁があるとき電源プラグを抜き、42ページの図に従いケースを外して乾拭きします。ユニットに水をかけず、分解やリンク操作をしないでください。定期予定にはしません。",
    "suggestions": [
      {
        "name": "給水タンク・浄水フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。取り外した各部品を水洗いします。洗剤は使わず、フィルター部分にはスポンジも使わずやさしく流水で洗います。長期不使用時はフィルターも十分乾燥させてください。"
      },
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "特鮮氷温ルームの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。電源プラグを抜き、食品を出して44ページの図に従ってケースを外し、ケースと容器をぬるま湯を含ませた柔らかい布で拭きます。洗剤は使わず、ドアやハンドルだけを持たずケース全体を持ち、指を下に入れないでください。取り付け後は何度か出し入れして正しく取り付けたことを確認してください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書44ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。電源プラグを抜き、食品を出して45ページの図に従って外し、ぬるま湯を含ませた柔らかい布で拭きます。野菜室のプラチナ触媒は取り外さず水洗いしないでください。下段ケースを外す前に必ずしきりを外し、再装着時はしきりの「PLATINUM」を図の向きに合わせて取り付けます。下段ケースはしきりを付けずに本体へ入れないでください。上段ケースの「手前 FRONT」を手前にし、冷凍室下段の小物ケースはスリットも手前、左右のつめは大物ケースの外側にします。下段ケースを水洗いした場合は裏返して排水し十分乾燥させます。背面の水垂れに注意し、歯ブラシやたわしなど毛足の長いものを使わず、ケースやレールの潤滑剤を拭き取らないでください。説明書にない部品を外さず、樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・側面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=41",
        "conditions": "説明書41ページ。物理的な清掃・交換は電源プラグを抜いて行います。脚カバーを外し調節脚を上げて冷蔵庫を手前に引き出す方法は、説明書の図と移動時の注意を確認してください。傷つきやすい床は板などで保護し、無理に動かさないでください。"
      },
      {
        "name": "製氷用浄水フィルターの交換",
        "kind": "交換",
        "intervalDays": 1095,
        "frequency": "約3〜4年が目安（予定計算は1095日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_gxcc67w_a.pdf#page=42",
        "conditions": "説明書42ページ。物理的な清掃・交換は電源プラグを抜いて行います。交換部品は説明書58ページで確認します。既に使用している場合は、使用開始日や交換履歴に合わせて予定を調整してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "日立",
    "productLinkLabel": "公式説明書一覧",
    "name": "冷凍冷蔵庫",
    "modelNumber": "R-27TV",
    "categoryId": "fridge",
    "productUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27TV/manual.html",
    "manualUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/R-27TV/manual.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "2023年10月発売の公式サポートとR-27TV専用説明書を確認済み。10ページの周期を提案します。側面は汚れに気づいたとき拭き、固定周期にはしません。部品の取り外し・取り付けは11ページの図で確認してください。給水タンク・自動製氷機・浄水フィルターの作業は提案しません。",
    "suggestions": [
      {
        "name": "ドア表面の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。柔らかい布をぬるま湯で湿らせて拭き、乾いた布で仕上げます。汚れに気づいたら予定日前でも拭き取ってください。"
      },
      {
        "name": "ドアパッキングの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で汚れを拭き取ります。汚れやすいため、日頃から確認してください。"
      },
      {
        "name": "汁受け部の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。ぬるま湯を含ませた柔らかい布で拭きます。汁がたまったり汚れたりした場合は、その都度取り除いてください。"
      },
      {
        "name": "棚・ポケットの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。説明書11ページの方法で外し、ぬるま湯を含ませた柔らかい布で拭きます。樹脂部品を食洗機や熱湯で洗わないでください。"
      },
      {
        "name": "収納ケースの清掃",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。電源プラグを抜き、部品の取り外しは11ページを確認し、ぬるま湯を含ませた柔らかい布で拭きます。食洗機や熱湯を使わず、ケースの可動接触面の潤滑剤を拭き取らないでください。 上段ケースのふちは下段ケース左右のふちにのせ、下段ケース左右後側の突起を枠の角穴に入れます。枠のローラーはレール内に入れ、11ページの図で確認してください。"
      },
      {
        "name": "電源プラグのほこり取り",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。物理的な清掃・交換は電源プラグを抜いて行います。コンセントから抜いた電源プラグを、乾いた布で拭いてほこりを取り除きます。"
      },
      {
        "name": "冷蔵庫の背面・床の清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "年に1〜2回（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://kadenfan.hitachi.co.jp/support/rei/item/docs/r_27tv_c.pdf#page=10",
        "conditions": "説明書10ページ。電源プラグを抜き、脚カバーを手前に引っ張ります。調節脚を床から浮かせ、冷蔵庫をまっすぐ手前に引き出し、背面・壁・床を拭きます。傷つきやすい床は保護し、機械室に手を入れず、蒸発皿を取り外さないでください。移動方法と取り付けは図で確認してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ25A",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ25A/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2026年2月発売を確認。専用説明書の印刷12〜13ページ（PDF7ページ）では吸込力が弱くなったとき（月1回程度）／気になったときのお手入れです。フィルターは紙パック交換後も吸込力が戻らないときだけ、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷13ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使い、挿入方向を合わせます（印刷10〜11ページ）。フィルター清掃や紙パック交換を固定周期にはしません。",
    "suggestions": [
      {
        "name": "床用ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf#page=7",
        "conditions": "説明書印刷12ページ（PDF7ページ）。切を押し電源プラグを抜く。絡まった髪の毛はピンセット等で取り除き、絡まったゴミは溝に沿ってはさみで切る。汚れがひどい場合のブラシカバーと回転部の脱着は図のひらく／しまる方向に従う。水洗い後は水を切り陰干しし、ドライヤーや洗剤を使わない。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/051/453/000000004051453/MC-PJ25A.pdf#page=7",
        "conditions": "説明書印刷13ページ（PDF7ページ）。切を押し電源プラグを抜き、柔らかい布で水拭きする。本体・ホース・延長管は水洗い禁止。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ250G",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ250G/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書印刷14〜16ページ（PDF8〜9ページ）のお手入れは、吸込力が弱くなったとき（月1回程度）／気になったときです。フィルターは紙パック交換後も吸込力が戻らないとき、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷16ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使用します（印刷12〜13ページ）。紙パック交換とフィルター清掃は固定周期にはしません。 ゴミ検知ランプのつき方がおかしいとき（消えないなど）は、内部センサーを柔らかい布でから拭きします。水洗い禁止、固定周期にはしません（印刷15ページ）。",
    "suggestions": [
      {
        "name": "親ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷14ページ（PDF8ページ）。切を押し電源プラグを抜き、接点・ローラーなどのごみを取り除きます。親ノズル本体は水洗い禁止で、回転部（ブラシ）だけ水洗いできます。取り外し・再装着時はベルトとブラシカバーのつめ、ひらく／しまるの方向を説明書の図で確認してください。水洗いしたブラシは水を切り陰干しして十分乾燥させ、ドライヤー・洗剤を使わないでください。"
      },
      {
        "name": "子ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、接点などのごみを取り除きます。子ノズルは水洗い禁止です。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/096/000000003562096/MC-PJ250G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、柔らかい布を固く絞って水拭きします。本体・ホース・延長管は水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使わないでください。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-PJ25G",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PJ25G/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書印刷14〜16ページ（PDF8〜9ページ）のお手入れは、吸込力が弱くなったとき（月1回程度）／気になったときです。フィルターは紙パック交換後も吸込力が戻らないとき、軽くはたくか軽く水洗いし、もみ洗い・洗濯機洗いをせず十分乾燥させ、ガイド内側に必ず再装着します（印刷16ページ）。紙パックは交換ランプの点灯・点滅時に純正M型Vタイプを使用します（印刷12〜13ページ）。紙パック交換とフィルター清掃は固定周期にはしません。",
    "suggestions": [
      {
        "name": "親ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷14ページ（PDF8ページ）。切を押し電源プラグを抜き、接点・ローラーなどのごみを取り除きます。親ノズル本体は水洗い禁止で、回転部（ブラシ）だけ水洗いできます。取り外し・再装着時はベルトとブラシカバーのつめ、ひらく／しまるの方向を説明書の図で確認してください。水洗いしたブラシは水を切り陰干しして十分乾燥させ、ドライヤー・洗剤を使わないでください。"
      },
      {
        "name": "子ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、接点などのごみを取り除きます。子ノズルは水洗い禁止です。"
      },
      {
        "name": "本体・ホース・延長管の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/562/100/000000003562100/MC-PJ25G.pdf#page=8",
        "conditions": "説明書印刷15ページ（PDF8ページ）。切を押し電源プラグを抜き、柔らかい布を固く絞って水拭きします。本体・ホース・延長管は水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使わないでください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-JP890K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-JP890K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/157/000000003745157/MC-JP890K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷14〜15ページ（PDF8ページ）では吸込力が弱くなったとき／気になったときのお手入れで、月1回の清掃とは記載されていません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ水洗いでき、ベルト・カバーのつめ・ひらく／しまる方向を図で確認し、十分乾燥させます。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭きし、水洗い禁止。フィルターは紙パック交換後も吸込力が戻らないときだけ軽くはたくか軽く水洗いし、押し洗いします。もみ洗い・洗濯機洗いをせず十分乾燥させ、図の印を上側に、ガイド（ゴム部）と溝の内側に再装着します。紙パックはランプの点滅・点灯時に純正M型Vタイプを使用し、挿入方向を合わせます（印刷12〜13ページ）。清掃・フィルター・紙パック交換を固定周期にはしません。",
    "suggestions": [
      {
        "name": "紙パックのたまり具合の確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/157/000000003745157/MC-JP890K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。ペットの毛や綿ごみが多いと、満杯でも紙パック交換ランプが反応しない場合があるため、直接たまり具合を確認します。この条件に当てはまる場合だけ追加してください。切を押し電源プラグを抜きます。交換自体は固定周期ではなくランプ・たまり具合で判断し、純正M型Vタイプを使用します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式キャニスター掃除機",
    "modelNumber": "MC-SR640K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SR640K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/163/000000003745163/MC-SR640K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。ゴミの量は種類によって変わるため、ゴミすてラインに達する前に捨てます。ペットの毛や綿ごみが多いと、ランプがつかなくても満杯の場合があります。清掃は吸込力が弱くなったとき／気になったとき、お手入れランプ点灯時などに行い、固定周期にはしません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ洗え、ベルト・カバーのつめ・ひらく／しまるの方向を図で確認し、十分乾燥させます。サイクロンユニットは約1時間水につけ、水中で振って流水洗浄。クリーンフィルターは軽くはたくか軽く流水で洗い、ブラシでこすりません。水洗いしたダストボックス類・ユニット・フィルターは風通しのよい場所で約24時間十分乾燥させてから戻します。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭き、水洗い禁止。付属のふとん用ノズルは必要時に軽く水洗いでき、十分乾燥させます（印刷14ページ）。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/163/000000003745163/MC-SR640K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。切を押し電源プラグを抜き、ゴミの量を確認します。ラインを超える前に、週の予定を待たずこまめに捨ててください。本体を立てたままダストボックスを外さず、底ぶたをカチッと閉めて本体へ確実に戻します。清掃で分解した場合はネットフィルター・サイクロンユニットを図の位置に必ず戻し、ふたのフックを掛けてください。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "サイクロン式キャニスター掃除機",
    "modelNumber": "MC-SR44K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SR44K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/168/000000003745168/MC-SR44K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年10月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。ゴミの量は種類によって変わるため、ゴミすてラインに達する前に捨てます。ペットの毛や綿ごみが多いと、ランプがつかなくても満杯の場合があります。清掃は吸込力が弱くなったとき／気になったとき、お手入れランプ点灯時などに行い、固定周期にはしません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転部（ブラシ）だけ洗え、ベルト・カバーのつめ・ひらく／しまるの方向を図で確認し、十分乾燥させます。サイクロンユニットは約1時間水につけ、水中で振って流水洗浄。クリーンフィルターは軽くはたくか軽く流水で洗い、ブラシでこすりません。水洗いしたダストボックス類・ユニット・フィルターは風通しのよい場所で約24時間十分乾燥させてから戻します。熱風や洗剤・ベンジン・シンナー・アルコールは使いません。センサーはゴミ検知ランプの異常時のみ柔らかい布でから拭き、水洗い禁止。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/745/168/000000003745168/MC-SR44K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。切を押し電源プラグを抜き、ゴミの量を確認します。ラインを超える前に、週の予定を待たずこまめに捨ててください。本体を立てたままダストボックスを外さず、底ぶたをカチッと閉めて本体へ確実に戻します。清掃で分解した場合はネットフィルター・サイクロンユニットを図の位置に必ず戻し、ふたのフックを掛けてください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NX700K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NX700K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/683/000000002777683/mc-nx700k.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年3月発売を確認。専用説明書印刷14〜20ページ（PDF8〜11ページ）を確認。お手入れ前は運転スイッチを切り、充電台の電源プラグを抜きます。紙パック交換は約2秒間隔の赤い点滅時に純正S型AMC-U2を使用。ケースは捨てず、交換後に本体を充電台へセットし直します。ダストボックスやプレ・スポンジフィルターは吸込力が戻らない／弱くなったとき（紙パック交換時）に清掃します。ネットフィルターを必ず戻し、底ぶたをカチッと閉めます。プレフィルターの凹凸を合わせて装着します。水洗いしたダストボックス・ネットフィルター・プレ／スポンジフィルターは風通しのよい場所で約24時間十分乾燥させます。ネットフィルターの汚れが残る場合は約1時間水につけ、水中で振って流水洗浄します。床用ノズルの回転ブラシは取り外して水洗いするタイプではなく、固く絞った布で水拭きし、ノズルカバーだけ水洗い可能です。カバーのつめを2か所の凹部に合わせます。ふとん用ノズル・ドックのクリーンフィルターは必要時に軽く水洗いでき、乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ乾拭き。充電端子・排気口・本体・延長管・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールは使いません。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/683/000000002777683/mc-nx700k.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があるため、直接確認します。該当する場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、紙パックケースをゆっくり外します。ケースは捨てません。交換は固定周期ではなく状態に応じて、純正S型AMC-U2を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NX810KM",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NX810KM/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/673/000000002777673/MC-NX810KM.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年10月発売を確認。専用説明書印刷16〜23ページ（PDF9〜12ページ）と付属注意書きを確認。お手入れ前は運転スイッチを切り、充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換し、ケースは捨てず、本体を充電台にセットし直します。ダストボックスとプレ／スポンジフィルターは吸込力が戻らない／弱くなったとき（紙パック交換時）に清掃。ネットフィルターを必ず戻し、底ぶたをカチッと閉め、プレフィルターの凹凸を合わせます。洗ったダストボックス・ネットフィルター・プレ／スポンジフィルターは風通しのよい場所で約24時間十分乾燥させます。ネットフィルターの汚れが残るときは約1時間水につけ、水中で振って流水洗浄します。床用ノズル本体は水洗い禁止で、回転ブラシは外して水洗い可能です。ベルト、カバーのつめ、図の解錠／施錠マークを合わせて戻し、十分乾燥させます。給水タンクは内側だけ水洗い可能。接点の水滴・ほこりは綿棒で除き、強く押しつけません。掃除後はタンクの水を捨てます。常温の水道水以外は入れず、ミスト吹出口も綿棒で手入れします。ふとん用ノズル・ドックのクリーンフィルターは必要時に軽く水洗いでき、乾燥後に戻します。センサーはクリーンランプの色が変わらないときのみ乾拭き。充電端子・排気口・本体・延長管・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールは使いません。清掃・紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/673/000000002777673/MC-NX810KM.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があるため直接確認します。該当する場合だけ追加してください。運転スイッチを切り、充電台の電源プラグを抜きます。ケースをゆっくり外し、ケースは捨てません。交換は固定周期ではなく状態に応じて純正S型AMC-U2を使用します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NS100K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NS100K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/015/000000000386015/mc-ns100k.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2023年11月発売を確認。専用説明書と共通のお手入れガイドを確認。お手入れ前は運転スイッチを切り充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換。ケースは捨てず、交換後に本体を充電台にセットし直します。フィルターケースは吸込力が回復しない／弱くなったとき（紙パック交換時）に清掃します。フィルター類は軽くはたき、歯ブラシなどでこすりません。水洗い時は約30分水につけ、水中で振って洗い、風通しのよい場所で約24時間十分乾燥させます。スポンジの切り欠きを合わせ、少し長くなっても押し込みません。不織布フィルターのゴムが外れたら凸部をゴムの溝にはめます。ケースのつめを本体の凹部に合わせカチッと戻します。床用ノズル本体は水洗い禁止。回転ブラシは固く絞った布で水拭きし、ノズルカバーだけ水洗いできます。カバーのつめを2か所の凹部に合わせます。プレフィルターとドックのクリーンフィルターは必要時に軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。充電端子・吸気路・排気口・吸気口・本体・ハンドル・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。青・赤ランプが同時点滅したらまずドックへ戻し、それでも消えない／吸込力が回復しなければケースを手入れします。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/015/000000000386015/mc-ns100k.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があります。この条件に当てはまる場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、ケースをゆっくり外して直接確認します。ケースは捨てません。交換自体は固定周期ではなく状態に応じて純正S型AMC-U2を使います。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "セパレート型コードレススティック掃除機",
    "modelNumber": "MC-NS70F",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-NS70F/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/016/000000000386016/mc-ns70f.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2023年11月発売を確認。専用説明書と共通のお手入れガイドを確認。お手入れ前は運転スイッチを切り充電台の電源プラグを抜きます。紙パックは約2秒間隔の赤い点滅時に純正S型AMC-U2で交換。ケースは捨てず、交換後に本体を充電台にセットし直します。フィルターケースは吸込力が回復しない／弱くなったとき（紙パック交換時）に清掃します。フィルター類は軽くはたき、歯ブラシなどでこすりません。水洗い時は約30分水につけ、水中で振って洗い、風通しのよい場所で約24時間十分乾燥させます。スポンジの切り欠きを合わせ、少し長くなっても押し込みません。不織布フィルターのゴムが外れたら凸部をゴムの溝にはめます。ケースのつめを本体の凹部に合わせカチッと戻します。床用ノズルは水洗い禁止。巻きついたごみはピンセットやはさみで取り除きます。プレフィルターとドックのクリーンフィルターは必要時に軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。充電端子・吸気路・排気口・吸気口・本体・ハンドル・充電台は水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。青・赤ランプが同時点滅したらまずドックへ戻し、それでも消えない／吸込力が回復しなければケースを手入れします。清掃や紙パック交換に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ドックの紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/000/386/016/000000000386016/mc-ns70f.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。ペットの毛や綿ごみが多いと、満杯でも交換ランプが点滅しない場合があります。この条件に当てはまる場合だけ追加してください。運転スイッチを切り充電台の電源プラグを抜き、ケースをゆっくり外して直接確認します。ケースは捨てません。交換自体は固定周期ではなく状態に応じて純正S型AMC-U2を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式コードレススティック掃除機",
    "modelNumber": "MC-PB61J",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-PB61J/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年11月発売を確認。専用説明書印刷12〜15ページ（PDF7〜8ページ）を確認。お手入れは吸込力が弱くなったとき（月1回程度）／気になったとき。床用ノズル本体・排気口・本体・延長管・スタンドは水洗い禁止で、回転ブラシだけ取り外して水洗いできます。フィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。紙パック交換は赤ランプの点滅がもうすぐ交換、点灯がすぐ交換で、ドック型NS/NXのランプ意味を流用しません。純正S型AMC-U2。交換自体に固定周期を設定しません。",
    "suggestions": [
      {
        "name": "床用ノズルの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。床用ノズル本体は水洗い禁止。回転部（ブラシ）だけ外して水洗いできます。絡まったごみは溝に沿ってはさみで切ります。説明書のベルト・ブラシカバー・起毛布側と解錠／施錠マークを確認して戻してください。洗ったブラシは十分乾燥させ、熱風や洗剤を使いません。"
      },
      {
        "name": "排気口の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。排気口のごみを取り除きます。水洗い禁止です。"
      },
      {
        "name": "本体・延長管・スタンドの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。柔らかい布を固く絞って水拭きします。本体・延長管・スタンドは水洗い禁止です。洗剤・ベンジン・シンナー・アルコールを使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "吸込力が弱くなったとき（月1回程度）／気になったとき（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=8",
        "conditions": "説明書印刷14〜15ページ（PDF8ページ）。運転スイッチを切り、充電アダプターを抜きます。軽くはたいてほこりを落とすか、軽く水洗いします。洗ったら水気を切り十分乾燥させ、必ず取り付けてください。ドライヤーなどの熱風や洗剤・ベンジン・シンナー・アルコールを使いません。"
      },
      {
        "name": "紙パックのたまり具合確認（ペットの毛・綿ごみが多い場合）",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "ペットの毛や綿ごみが多いとき：月1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/873/902/000000002873902/MC-PB61J.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。満杯でもランプが反応しない場合があるため、この条件に当てはまる場合だけ追加してください。運転スイッチを切り、充電アダプターを抜きます。交換は固定周期ではなく、赤いランプの約2秒間隔の点滅はもうすぐ交換、点灯はすぐ交換です。純正S型AMC-U2を横長方向（A方向）に挿入し、白ボール紙を枠に沿わせて広げます。ケースはカチッと戻し紙パックを挟み込みません。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB35K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB35K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/956/000000003590956/MC-SB35K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書を確認。お手入れ前は「切」を押し、充電アダプターを抜きます。ゴミ捨てはラインを超える前にこまめに行います。ダストボックス清掃はゴミを捨てても吸込力が戻らないとき、または赤いお手入れランプが点灯したとき。標準運転ではランプは光りません。ネットフィルターを外してごみを捨て、プリーツフィルターを図の向きで戻し、ネットフィルターをダストカップに戻して本体にカチッと装着します。水洗いする場合はネットフィルターを約30分水につけ、プリーツフィルターは流水で洗い、ブラシでこすりません。洗った部品は風通しのよい場所で約24時間十分乾燥させます。床用ノズル本体・排気口・本体・延長管・スタンドは水洗い禁止。回転ブラシだけ取り外して水洗いでき、ベルト・カバー・起毛布側と解錠／施錠マークを確認して戻します。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。清掃は吸込力が弱くなったとき／気になったときで、固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/956/000000003590956/MC-SB35K.pdf#page=7",
        "conditions": "説明書印刷12〜13ページ（PDF7ページ）。「切」を押し、充電アダプターを抜きます。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターをダストカップに戻して本体に確実にカチッと装着します。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB55K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB55K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/953/000000003590953/MC-SB55K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年8月発売を確認。専用説明書を確認。お手入れ前は「切」を押し、充電台から本体を外します。ゴミ捨てはラインを超える前にこまめに行います。ダストボックス清掃はゴミを捨てても吸込力が戻らないとき、または操作部の青色・赤色ランプが同時点滅して吸わなくなったとき。ネットフィルターを外してごみを捨て、プリーツフィルターを図の向きで戻し、ネットフィルターをダストカップに戻して本体にカチッと装着します。水洗いする場合はネットフィルターを約30分水につけ、プリーツフィルターは流水で洗い、ブラシでこすりません。洗った部品は風通しのよい場所で約24時間十分乾燥させます。床用ノズル本体・排気口・本体・延長管・充電台は水洗い禁止。回転ブラシだけ取り外して水洗いでき、ベルト・カバー・起毛布側と解錠／施錠マークを確認して戻します。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。ゴミ検知ランプのつき方がおかしいときのみ、内部センサーを柔らかい布で乾拭きします。センサーは水洗い禁止です。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。清掃は吸込力が弱くなったとき／気になったときで、固定周期を設定しません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/590/953/000000003590953/MC-SB55K.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。「切」を押し、充電台から本体を外します。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターをダストカップに戻して本体に確実にカチッと装着します。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "サイクロン式コードレススティック掃除機",
    "modelNumber": "MC-SB70KM",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-SB70KM/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/679/000000002777679/MC-SB70KM.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2024年10月発売を確認。専用説明書印刷16〜21ページ（PDF9〜11ページ）と給水タンク注意書きを確認。お手入れ前は運転スイッチを切り、充電アダプターを抜きます。ゴミはラインを超える前にこまめに捨てます。清掃はゴミ捨て後も吸込力が戻らないとき／操作部の青・赤ランプが同時点滅して吸わなくなったときなどに行い、固定周期を設定しません。ダストフィルターは軽くはたき、表面のごみはティッシュで拭き取ります。ダストカップ・ネットフィルター・ダストフィルター・スポンジフィルターは汚れが気になるとき水洗いでき、約24時間風通しのよい場所で十分乾燥させます。スポンジをダストフィルターに確実に戻し、ネットフィルターとダストフィルターをセットして、ダストボックスをカチッと装着します。床用ノズル本体は水洗い禁止で、回転ブラシだけ外して水洗いできます。ベルト・カバーのつめ・解錠／施錠マークを合わせ十分乾燥後に戻します。給水タンクは内側だけ水洗い可能。接点の水滴・ほこりは綿棒で取り除き、強く押しつけません。常温の水道水以外は入れず、掃除後は水を捨てます。ミスト吹出口も水滴・ほこりを綿棒で取り除き、強く押しつけません。プレフィルターは軽くはたくか軽く水洗いし、十分乾燥後に必ず戻します。ふとん用ノズルは必要時に軽く水洗いし、十分乾燥させます。センサーはクリーンランプの色が変わらないときだけ柔らかい布で乾拭き。センサー・排気口・本体・延長管・スタンドは水洗い禁止。熱風・洗剤・ベンジン・シンナー・アルコールを使いません。",
    "suggestions": [
      {
        "name": "ダストボックスのゴミすてライン確認",
        "kind": "点検",
        "intervalDays": 7,
        "frequency": "週に1度が目安（予定計算は7日）／ラインを超える前にゴミ捨て",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/002/777/679/000000002777679/MC-SB70KM.pdf#page=9",
        "conditions": "説明書印刷16〜17ページ（PDF9ページ）。運転スイッチを切り、充電アダプターを抜きます。ゴミの種類によってたまり方が違うため、予定を待たずラインを超える前に捨てます。ペットの毛や綿ごみが多いとランプが反応しない場合もあるため直接確認してください。ネットフィルターとダストフィルターを戻し、本体に確実にカチッと装着します。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "紙パック式キャニスター掃除機",
    "modelNumber": "MC-JP880K",
    "categoryId": "vacuum",
    "productUrl": "https://panasonic.jp/soji/products/MC-JP880K/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/246/245/000000003246245/MC-JP880K.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/soji/products.html",
    "verifiedAt": "2026-10-09",
    "lookupNote": "公式商品一覧で2025年5月発売を確認。専用説明書印刷12〜17ページ（PDF7〜9ページ）を確認。清掃は吸込力が弱くなったとき／気になったときで、固定周期を設定しません。切を押し電源プラグを抜きます。親ノズル本体・手元ブラシ・子ノズル・本体・ホース・延長管は水洗い禁止。回転ブラシは固く絞った布で水拭きし、ノズルカバーだけ水洗いできます。カバーのつめを2か所の凹部にはめ込みます。洗浄後は十分乾燥させ、熱風や洗剤・ベンジン・シンナー・アルコールを使いません。センサーはクリーンランプのつき方がおかしいときだけ柔らかい布で乾拭きし、水洗い禁止です。フィルターは紙パック交換後も吸込力が戻らないときだけ軽くはたくか軽く水洗いし、押し洗いします。もみ洗い・洗濯機洗いをせず十分乾燥させ、図の印を上側にしてガイド（ゴム部）と溝の内側へ必ず戻します。紙パックは純正M型Vタイプを使用。オレンジ色ランプの約2秒間隔の点滅はもうすぐ交換、点灯はすぐ交換です。紙パックの挿入方向を合わせ、シャッター付きなら捨てる前にシャッターを閉じます。交換自体は固定周期にはしません。",
    "suggestions": [
      {
        "name": "紙パックのたまり具合確認",
        "kind": "点検",
        "intervalDays": 30,
        "frequency": "月1回程度（予定計算は30日）／ランプとたまり具合で交換を判断",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/246/245/000000003246245/MC-JP880K.pdf#page=9",
        "conditions": "説明書印刷16ページ（PDF9ページ）の「紙パックはいつ交換するの？」を確認。ゴミの種類によってランプが正しく点灯しない場合があるため、直接たまり具合を確認します。切を押し電源プラグを抜きます。ペットの毛や綿ごみが多い場合は特に確認してください（印刷12ページ）。交換は固定周期ではなく、純正M型Vタイプを使用し、挿入方向を合わせます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KX07D",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KX07D/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品一覧で2026年9月発売を確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/080/000000004502080/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KX05D",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KX05D/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品一覧で2026年9月発売を確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/084/000000004502084/KX07D_KX05D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KF07D",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KF07D/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品一覧で2026年9月発売を確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/502/074/000000004502074/KF07D_web_HP%E6%8E%B2%E8%BC%89%E7%89%88.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KX07C",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KX07C/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/products/FE-KX07C.html",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品ページで2025年度モデルと確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KX05C",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KX05C/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/products/FE-KX05C.html",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品ページで2025年度モデルと確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/356/000000003749356/KX07C_KX05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "気化式加湿機",
    "modelNumber": "FE-KF07C",
    "categoryId": "humidifier",
    "productUrl": "https://panasonic.jp/kashitsu/products/FE-KF07C/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf",
    "manualLinkLabel": "取扱説明書（詳細版）",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://panasonic.jp/kashitsu/products/FE-KF07C.html",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式商品ページで2025年度モデルと確認。公式サポートの詳細版説明書12〜14ページを確認。タンクは毎日、プレフィルター・トレー・加湿フィルターと枠・イオン除菌ユニットは約1か月に1回お手入れします。におい、水が減りにくい、トレーの水が変色する場合は早めに行います。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターの交換目安は約10年（1日8時間運転・定期的なお手入れ時）ですが、においが取れない、水が減らない、傷みや縮みがある場合は早めに交換します。交換用FE-ZKE07を使い、フィルター枠は捨てません。長期保管ではタンク・トレーの水を捨て、すべてお手入れし、加湿フィルターを十分陰干しして乾かします。本体は寝かせたり逆さにしたりせず、湿気の少ない場所に保管します。",
    "suggestions": [
      {
        "name": "タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（予定計算は1日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクを水洗いします。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。背面・側面の汚れを掃除機などで取り除きます。突起を穴に差し込み、カチッと音がするまで戻します。外したまま運転しません。"
      },
      {
        "name": "トレーの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=12",
        "conditions": "説明書12ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。タンクと側面プレフィルターを外してトレーを取り出し、水洗いします。細部は綿棒や歯ブラシで掃除します。フロートは外しません。排水はトレーを取り出してから行い、本体から直接排水しません。"
      },
      {
        "name": "加湿フィルター・フィルター枠の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。加湿フィルターは水かぬるま湯で押し洗いし、枠は水洗いします。ブラシでこすらず、洗濯機・乾燥機を使いません。すぐ使う場合はぬれたままで構いません。縫い合わせの赤線を内側にしてトレーに入れ、枠をかぶせカチッとロックします。"
      },
      {
        "name": "イオン除菌ユニットのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "約1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/003/749/189/000000003749189/KF07C_KF05C_HP%E6%8E%B2%E8%BC%89%E7%94%A8_web_0.pdf#page=13",
        "conditions": "説明書13ページ。電源プラグを抜いてからお手入れします。お手入れ後は電源プラグを差し込み「フィルター」ボタンを約3秒押してリセットします。ユニットは枠から外れないため、ユニット部分だけを加湿機用洗浄剤などでつけ置き洗いします。分解せず、ブラシでこすったり強く押したりしません。説明書14ページの洗浄剤使用方法に従い、約30分つけ置き後、新しい水で2〜3回すすぎます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "エコ・ハイブリッド方式 衣類乾燥除湿機",
    "modelNumber": "F-YEX120B",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://panasonic.jp/joshitsu/products/F-YEX120B/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/653/000000004397653/F-YEX120B_web.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn240410-1",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式発表で2024年5月30日発売を確認。専用説明書18〜19ページを確認。左右のフィルターは2週間に1回程度、タンクセットは1か月に1回程度お手入れします。清掃前は電源プラグを抜き、必ず排水します。本体はかたく絞った布で拭き、水洗い・寝かせることを避けます。内部乾燥は運転後や長期間使わないときに行うことが推奨され、固定周期は設定しません。約1時間後に自動停止します（説明書23ページ）。長期保管前は内部乾燥・排水・すべての清掃を行い、ほこりよけをかぶせ、水平で安定した湿気の少ない場所に立てて保管します。",
    "suggestions": [
      {
        "name": "左右フィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/653/000000004397653/F-YEX120B_web.pdf#page=19",
        "conditions": "説明書18〜19ページ。電源プラグを抜き、必ず排水してから行います。左右のフィルターの汚れを掃除機などで取り除きます。繊維部分を強くこすったり押したりしません。つめを本体の穴に合わせ、上側を押してはめ込みます。フィルターを外したまま使わず、破損した場合は交換します。"
      },
      {
        "name": "タンクセットのすすぎ洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/653/000000004397653/F-YEX120B_web.pdf#page=19",
        "conditions": "説明書18〜19ページ。電源プラグを抜き、必ず排水してから行います。タンクハンドルを上げ、排水口を開けてタンクふたを引き上げます。排水口を引っ張りません。タンクとふたを水で2〜3回すすぎます。フロートは外さず、水でぬめりや軸周辺の汚れを落とします。しつこい汚れには薄めた台所用中性洗剤を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "エコ・ハイブリッド方式 衣類乾燥除湿機",
    "modelNumber": "F-YEX200D",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://panasonic.jp/joshitsu/products/F-YEX200D/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/655/000000004397655/F-YEX200D_web.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn260311-1",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式発表で2026年4月発売を確認。専用説明書19ページを確認。フィルターは2週間に1回程度、タンクセットは1か月に1回程度お手入れします。清掃前は電源プラグを抜き、必ず排水します。本体はかたく絞った布で拭き、水洗い・寝かせることを避けます。内部乾燥は運転後や長期間使わないときに行うことが推奨され、固定周期は設定しません。約1時間後に自動停止します。内部乾燥が終わるまでタンクを外しません（説明書23ページ）。長期保管前は内部乾燥・排水・すべての清掃を行い、ほこりよけをかぶせ、水平で安定した湿気の少ない場所に立てて保管します。",
    "suggestions": [
      {
        "name": "左右フィルター・本体側フィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/655/000000004397655/F-YEX200D_web.pdf#page=19",
        "conditions": "説明書19ページ。電源プラグを抜き、必ず排水してから行います。左右のフィルターと本体側フィルターの汚れを掃除機などで取り除きます。外したフィルターは汚れが気になるとき水洗いします。繊維部分を強くこすったり押したりしません。左右共用で、つまみを取っ手の位置に合わせ、本体のつめにフィルターの穴を差し込み、上側を押して取り付けます。フィルターを外したまま使わず、破損した場合は交換します。"
      },
      {
        "name": "タンクセットのすすぎ洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/655/000000004397655/F-YEX200D_web.pdf#page=19",
        "conditions": "説明書18〜19ページ。電源プラグを抜き、必ず排水してから行います。タンクハンドルを上げ、排水口を開けてタンクふたを引き上げます。排水口を引っ張りません。タンクとふたを水で2〜3回すすぎます。フロートは外さず、水でぬめりや軸周辺の汚れを落とします。しつこい汚れには薄めた台所用中性洗剤を使います。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "エコ・ハイブリッド方式 衣類乾燥除湿機",
    "modelNumber": "F-YEX90D",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://panasonic.jp/joshitsu/products/F-YEX90D/support.html",
    "productLinkLabel": "公式サポート",
    "manualUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/657/000000004397657/F-YEX90D_web.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://news.panasonic.com/jp/press/jn260311-1",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式発表で2026年4月発売を確認。専用説明書17ページを確認。フィルターは2週間に1回程度、タンクセットは1か月に1回程度お手入れします。清掃前は電源プラグを抜き、必ず排水します。本体はかたく絞った布で拭き、水洗い・寝かせることを避けます。内部乾燥は運転後や長期間使わないときに行うことが推奨され、固定周期は設定しません。約1時間後に自動停止します。内部乾燥が終わるまでタンクを外しません（説明書15ページ）。長期保管前は内部乾燥・排水・すべての清掃を行い、ほこりよけをかぶせ、水平で安定した湿気の少ない場所に立てて保管します。",
    "suggestions": [
      {
        "name": "吸込口（フィルター）の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/657/000000004397657/F-YEX90D_web.pdf#page=17",
        "conditions": "説明書17ページ。電源プラグを抜き、必ず排水してから行います。背面の吸込口（フィルター）の汚れを掃除機などで取り除きます。説明書の手順は取り付けた状態での掃除です。"
      },
      {
        "name": "タンクセットのすすぎ洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://panasonic.jp/content/dam/panasonic/jp/ja/pim-assets/support/manual/000/000/004/397/657/000000004397657/F-YEX90D_web.pdf#page=16",
        "conditions": "説明書16ページ。電源プラグを抜き、必ず排水してから行います。排水口を開けてタンクふたを引き上げます。排水口を引っ張りません。タンクとふたを水で2〜3回すすぎます。フロートは外さず、水でぬめりや軸周辺の汚れを落とします。しつこい汚れには薄めた台所用中性洗剤を使います。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "SHARP",
    "name": "プラズマクラスター衣類乾燥除湿機",
    "modelNumber": "CV-T190",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://jp.sharp/joshitsu/products/cv-t190/",
    "productLinkLabel": "公式商品情報",
    "manualUrl": "https://jp.sharp/restricted/support/manual/dehumid_con/cvt190_mn.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://corporate.jp.sharp/news/250305-a.html",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式発表で2025年3月13日発売を確認。専用説明書16〜17ページを確認。排水タンクは1週間に1回、プレフィルターは2週間に1回、本体は1か月に1回お手入れします。必ず運転を停止して電源プラグを抜き、排水してから行います。指定外の洗剤は使いません。長期間使わないときは、清掃後に水分をよく拭き取り十分乾燥させ、直射日光の当たらない湿気の少ない場所に保管します（説明書20ページ）。",
    "suggestions": [
      {
        "name": "排水タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://jp.sharp/restricted/support/manual/dehumid_con/cvt190_mn.pdf#page=16",
        "conditions": "説明書16ページ。必ず運転を停止して電源プラグを抜き、排水してから行います。タンクふたを外し、排水タンクとふたの内側を食器洗い用スポンジなどで洗います。汚れがひどいときは食器用中性洗剤を薄めたぬるま湯で洗います。柔らかい布で水分を拭き、フロートがきちんと取り付けられていることを確認し、タンクふたをしっかりはめます。"
      },
      {
        "name": "プレフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://jp.sharp/restricted/support/manual/dehumid_con/cvt190_mn.pdf#page=17",
        "conditions": "説明書17ページ。必ず運転を停止して電源プラグを抜き、排水してから行います。前パネルを外し、プレフィルターのホコリを掃除機で吸い取ります。力を加えすぎません。汚れがひどいときは台所用中性洗剤を溶かした液で約10分つけ置きし、歯ブラシで軽くこすりながら洗剤を十分に洗い流して陰干しします。プレフィルターがきちんと取り付けられていることを確認し、前パネルを戻します。"
      },
      {
        "name": "本体・キャスターの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://jp.sharp/restricted/support/manual/dehumid_con/cvt190_mn.pdf#page=17",
        "conditions": "説明書17ページ。必ず運転を停止して電源プラグを抜き、排水してから行います。本体と4か所のキャスターを柔らかい布で拭きます。本体は絶対に水洗いしません。汚れがひどいときは水または40℃以下のぬるま湯を含ませた布で拭きます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-P180YX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348075",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z267h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348075",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2025年5月1日発売を確認。専用説明書の印刷19〜20ページ（PDF10〜11ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、タンクふたを戻してから本体にセットします。エアフィルターMJPR-830VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z267h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z267h01.pdf#page=11",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷20ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z267h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-PV250YX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348076",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z266h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348076",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2025年5月1日発売を確認。専用説明書の印刷19ページ（PDF10ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、タンクふたを戻してから本体にセットします。エアフィルターMJPR-831VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z266h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z266h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z266h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);


catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-M120YX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348074",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z268h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348074",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2025年5月1日発売を確認。専用説明書の印刷26〜28ページ（PDF14〜15ページ）を確認。吸込口・センサー部とフィルターは2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外しません。ムーブアイ・光ガイド発光部は汚れたときに乾いた綿棒で軽く拭き、水・アルコール・洗剤は使いません。光ガイドは停止・プラグを抜いた後にルーバーを動かして清掃し、運転中は手で動かしません。エアフィルターMJPR-829VFTの交換目安は2年ですが使用環境・状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合は早めに交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z268h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷26ページ。フィルターカバーを外し、吸込口・湿度センサー・室温センサー部の汚れを掃除機で吸い取ります。金属フィンが変形するためブラシ付きノズルは使いません。"
      },
      {
        "name": "フィルターカバー・エアフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z268h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。フィルターカバーを外し、エアフィルターを取り出して汚れを掃除機で吸い取ります。エアフィルターが傷むためブラシ付きノズルは使いません。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、フィルターとカバーを戻します。洗剤は使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z268h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で陰干しします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-M120WX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335545",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z264h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335545",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2024年4月22日発売を確認。専用説明書の印刷26〜28ページ（PDF14〜15ページ）を確認。吸込口・センサー部とフィルターは2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外しません。ムーブアイ・光ガイド発光部は汚れたときに乾いた綿棒で軽く拭き、水・アルコール・洗剤は使いません。光ガイドは停止・プラグを抜いた後にルーバーを動かして清掃し、運転中は手で動かしません。エアフィルターMJPR-829VFTの交換目安は2年ですが使用環境・状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合は早めに交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z264h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷26ページ。フィルターカバーを外し、吸込口・湿度センサー・室温センサー部の汚れを掃除機で吸い取ります。金属フィンが変形するためブラシ付きノズルは使いません。"
      },
      {
        "name": "フィルターカバー・エアフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z264h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。フィルターカバーを外し、エアフィルターを取り出して汚れを掃除機で吸い取ります。エアフィルターが傷むためブラシ付きノズルは使いません。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、フィルターとカバーを戻します。洗剤は使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z264h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で陰干しします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-P180WX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335546",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z263h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335546",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2024年4月22日発売を確認。専用説明書の印刷19〜20ページ（PDF10〜11ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、排水ガードを取り付けてから本体にセットします。エアフィルターMJPR-830VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z263h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z263h01.pdf#page=11",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷20ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z263h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-PV250WX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335544",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z262h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335544",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2024年4月22日発売を確認。専用説明書の印刷19ページ（PDF10ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、排水ガードを取り付けてから本体にセットします。エアフィルターMJPR-831VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z262h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z262h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z262h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "空清脱臭除湿機",
    "modelNumber": "MJ-PHDV24WX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335094",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z261h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=335094",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2024年3月1日発売を確認。専用説明書の印刷24〜26ページ（PDF13〜14ページ）を確認。吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーは2週間に1回程度、高感度ダスト/ホコリセンサーのレンズは半年に1回程度清掃します。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きし、タンクの汚れが落ちない場合は水かぬるま湯で洗い乾いた布で拭きます。フロートは取り外さず、排水ガードを取り付けてから本体に戻します。フィルターカバー・HEPAフィルターは汚れたときに掃除機のブラシ付きノズルでほこりを吸い取り、活性炭フィルターのお手入れは不要です。HEPA・活性炭フィルターは水洗いして再使用できません。フィルター交換ランプ点灯、ひどい汚れやいやなニオイがある場合にMJPR-PHDVFTのHEPA・活性炭フィルターセットを一緒に交換します。ランプは約3年の使用で点灯しますが、寿命は使用状況・環境で異なるため固定交換予定は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・スマートフラップ・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z261h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバー・HEPAフィルター・活性炭フィルターを外し、吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーの汚れを掃除機で吸い取ります。清掃後は活性炭フィルター・HEPAフィルター・フィルターカバーを取り付けます。洗剤などは使いません。"
      },
      {
        "name": "高感度ダスト/ホコリセンサーのレンズ清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "半年に1回程度（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z261h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバーを外し、正面と左側面の2か所のレンズを乾いた綿棒で清掃します。水・アルコール・洗剤で拭きません。フィルターカバーを取り付け直します。"
      },
      {
        "name": "連続排水時のホース点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z261h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷24ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホース内に異物や汚れがたまっていないか、つまり・折れ曲がり・ひび割れなどの劣化がないか確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "空清脱臭除湿機",
    "modelNumber": "MJ-PHDV24YX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348073",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z265h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=348073",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2025年5月1日発売を確認。専用説明書の印刷24〜26ページ（PDF13〜14ページ）を確認。吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーは2週間に1回程度、高感度ダスト/ホコリセンサーのレンズは半年に1回程度清掃します。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きし、タンクの汚れが落ちない場合は水かぬるま湯で洗い乾いた布で拭きます。フロートは取り外さず、タンクふたを取り付けてから本体に戻します。フィルターカバー・HEPAフィルターは汚れたときに掃除機のブラシ付きノズルでほこりを吸い取り、活性炭フィルターのお手入れは不要です。HEPA・活性炭フィルターは水洗いして再使用できません。フィルター交換ランプ点灯、ひどい汚れやいやなニオイがある場合にMJPR-PHDVFTのHEPA・活性炭フィルターセットを一緒に交換します。ランプは約3年の使用で点灯しますが、寿命は使用状況・環境で異なるため固定交換予定は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・スマートフラップ・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z265h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバー・HEPAフィルター・活性炭フィルターを外し、吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーの汚れを掃除機で吸い取ります。清掃後は活性炭フィルター・HEPAフィルター・フィルターカバーを取り付けます。洗剤などは使いません。"
      },
      {
        "name": "高感度ダスト/ホコリセンサーのレンズ清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "半年に1回程度（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z265h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバーを外し、正面と左側面の2か所のレンズを乾いた綿棒で清掃します。水・アルコール・洗剤で拭きません。フィルターカバーを取り付け直します。"
      },
      {
        "name": "連続排水時のホース点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z265h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷24ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホース内に異物や汚れがたまっていないか、つまり・折れ曲がり・ひび割れなどの劣化がないか確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "空清脱臭除湿機",
    "modelNumber": "MJ-PHDV24ZX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366927",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z279h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366927",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2026年5月22日発売を確認。専用説明書の印刷24〜26ページ（PDF13〜14ページ）を確認。吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーは2週間に1回程度、高感度ダスト/ホコリセンサーのレンズは半年に1回程度清掃します。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きし、タンクの汚れが落ちない場合は水かぬるま湯で洗い乾いた布で拭きます。フロートは取り外さず、タンクふたを取り付けてから本体に戻します。フィルターカバー・静電フィルターは汚れたときに掃除機のブラシ付きノズルでほこりを吸い取り、活性炭フィルターのお手入れは不要です。静電・活性炭フィルターは洗っても再使用できません。フィルター交換ランプ点灯、ひどい汚れやいやなニオイがある場合にMJPR-PHDVFTの静電・活性炭フィルターセットを一緒に交換します。ランプは約3年の使用で点灯しますが、寿命は使用状況・環境で異なるため固定交換予定は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・スマートフラップ・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z279h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバー・静電フィルター・活性炭フィルターを外し、吸込口・スマートフラップ・湿度センサー・冷却口・ニオイセンサーの汚れを掃除機で吸い取ります。清掃後は活性炭フィルター・静電フィルター・フィルターカバーを取り付けます。洗剤などは使いません。"
      },
      {
        "name": "高感度ダスト/ホコリセンサーのレンズ清掃",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "半年に1回程度（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z279h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷25ページ。フィルターカバーを外し、正面と左側面の2か所のレンズを乾いた綿棒で清掃します。水・アルコール・洗剤で拭きません。フィルターカバーを取り付け直します。"
      },
      {
        "name": "連続排水時のホース点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z279h01.pdf#page=13",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷24ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホース内に異物や汚れがたまっていないか、つまり・折れ曲がり・ひび割れなどの劣化がないか確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-M120ZX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366928",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z282h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366928",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2026年5月22日発売を確認。専用説明書の印刷26〜28ページ（PDF14〜15ページ）を確認。吸込口・センサー部とフィルターは2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外しません。ムーブアイ・光ガイド発光部は汚れたときに乾いた綿棒で軽く拭き、水・アルコール・洗剤は使いません。光ガイドは停止・プラグを抜いた後にルーバーを動かして清掃し、運転中は手で動かしません。エアフィルターMJPR-829VFTの交換目安は2年ですが使用環境・状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合は早めに交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z282h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷26ページ。フィルターカバーを外し、吸込口・湿度センサー・室温センサー部の汚れを掃除機で吸い取ります。金属フィンが変形するためブラシ付きノズルは使いません。"
      },
      {
        "name": "フィルターカバー・エアフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z282h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。フィルターカバーを外し、エアフィルターを取り出して汚れを掃除機で吸い取ります。エアフィルターが傷むためブラシ付きノズルは使いません。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、フィルターとカバーを戻します。洗剤は使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z282h01.pdf#page=14",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷27ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で陰干しします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-P180ZX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366929",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z281h01.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366929",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2026年5月22日発売を確認。専用説明書の印刷19〜20ページ（PDF10〜11ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、タンクふたを取り付けてから本体にセットします。エアフィルターMJPR-830VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z281h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z281h01.pdf#page=11",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷20ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z281h01.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "三菱電機",
    "name": "衣類乾燥除湿機",
    "modelNumber": "MJ-PV250ZX",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366930",
    "productLinkLabel": "公式製品情報",
    "manualUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z280h02.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.mitsubishielectric.co.jp/ldg/wink/ssl/displayProduct.do?pid=366930",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式製品情報で2026年5月22日発売を確認。専用説明書の印刷19ページ（PDF10ページ）を確認。吸込口・フィルターカバー・エアフィルター・センサー部は2週間に1回程度、エアフィルターのつけ置き洗いは3か月に1回程度行います。運転スイッチを切にして電源プラグを抜いてから行います。タンク・本体は汚れたときに柔らかい布で乾拭きします。タンクの汚れが落ちないときは水かぬるま湯で洗い、乾いた布で拭きます。フロートは取り外さず、タンクふたを取り付けてから本体にセットします。エアフィルターMJPR-831VFTの寿命目安は2年ですが使用状況によって異なり、つけ置き洗い8回、煙で茶色くなる、ほこりで黒ずむ場合に交換します。一律の交換周期は設定しません。",
    "suggestions": [
      {
        "name": "吸込口・フィルター・センサー部の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z280h02.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。フィルターカバーを外し、吸込口・センサー部を掃除機で清掃します。カバーからエアフィルターを取り出し、汚れを掃除機で吸い取ります。汚れがひどい場合は水かぬるま湯で洗い流してよく乾燥させ、エアフィルターとカバーを戻します。洗剤などは使いません。フィルターカバーは破損や破れがない限り交換不要です。"
      },
      {
        "name": "エアフィルターのつけ置き洗い",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z280h02.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷19ページ。エアフィルターを取り出し、水かぬるま湯で約30分つけ置き洗いします。洗剤・熱湯・ブラシ・もみ洗いを避け、洗濯ばさみでつるさず平らな場所で乾かします。ぬれたまま使いません。エアフィルターとカバーを戻します。つけ置き洗いは8回程度が限度で、8回洗ったら新しいエアフィルターに交換します。"
      },
      {
        "name": "連続排水時のホース・フィルター点検",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "連続排水または無人で長時間使用する場合、2週間に1回程度（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://dl.mitsubishielectric.co.jp/dl/ldg/wink/ssl/wink_doc/m_contents/wink/MA_IB/zt936z280h02.pdf#page=10",
        "conditions": "運転スイッチを切にして電源プラグを抜いてから行います。印刷18ページ。連続排水または無人で長時間使用する場合だけ選択してください。ホースのつまり・折れ曲がり・ひび割れなどの劣化とエアフィルターの汚れを確認します。ホース周囲が氷点下になる場所では連続排水しません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "衣類乾燥除湿機",
    "modelNumber": "IJC-R65",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108184.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式説明書一覧で2025年2月発売を確認。専用説明書29〜31ページで、本体・水タンクとふた・吸気口カバーのお手入れを月1回程度と確認しました。排水時はフロートを絶対に外さず、フロート室の異物を確認します。タンクのふたと排水口を閉めて奥まで確実に取り付けます（23〜24ページ）。運転停止直後のタンク取り外しは避けます。内部乾燥は運転停止後や長期間使用しない場合に行うため、固定の日数による予定は設定しません。",
    "suggestions": [
      {
        "name": "本体のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108184.pdf#page=30",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書30ページ。本体は水洗いせず、水または40℃以下のぬるま湯を含ませてよく絞った柔らかい布で拭きます。落ちにくい汚れは薄めた中性洗剤を含ませた布で拭き、その後かたく絞った布で洗剤分を拭き取ります。"
      },
      {
        "name": "水タンク・水タンクふたの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108184.pdf#page=31",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書31ページ。水タンクふたを外して水洗いし、水気を拭いてよく乾かします。フロート室内のごみや異物は洗い流します。落ちにくい汚れは中性洗剤で洗い、よくすすぎます。フロートは絶対に外しません。ふたと排水口を閉めて奥まで確実に取り付けます。"
      },
      {
        "name": "吸気口カバー・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108184.pdf#page=31",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書31ページ。吸気口カバー（エアフィルター）と本体の吸気口のほこりを掃除機で取り除きます。エアフィルターを傷めるためブラシ付きノズルは使いません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "衣類乾燥除湿機",
    "modelNumber": "AJ-C48A",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114742.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式説明書一覧でAJ-C48A-Wの2026年5月発売と専用説明書を確認。説明書表紙の品番AJ-C48Aに対応します。31〜33ページで、本体・水タンクとふた・吸気口カバーのお手入れを月1回程度と確認しました。タンクは両手でしっかり持ち、フロートを絶対に外さず、フロート室の異物を確認します。ふたと排水口をしっかり閉め、奥まで確実に取り付けます（26〜27ページ）。内部乾燥は運転停止後や長期間使用しない場合に行うため、固定の日数による予定は設定しません。",
    "suggestions": [
      {
        "name": "本体のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114742.pdf#page=32",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書32ページ。本体は水洗いせず、水または40℃以下のぬるま湯を含ませてよく絞った柔らかい布で拭きます。落ちにくい汚れは薄めた中性洗剤を含ませた布で拭き、その後かたく絞った布で洗剤分を拭き取ります。"
      },
      {
        "name": "水タンク・水タンクふたの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114742.pdf#page=33",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書33ページ。水タンクふたを外して水洗いし、水気を拭いてよく乾かします。フロート室内のごみや異物は洗い流します。落ちにくい汚れは中性洗剤で洗い、よくすすぎます。フロートは絶対に外しません。ふたと排水口を閉めて奥まで確実に取り付けます。"
      },
      {
        "name": "吸気口カバー・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114742.pdf#page=33",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書33ページ。吸気口カバー（エアフィルター）と本体の吸気口のほこりを掃除機で取り除きます。エアフィルターを傷めるためブラシ付きノズルは使いません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "衣類乾燥除湿機",
    "modelNumber": "KJ-C481",
    "categoryId": "dehumidifier-appliance",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114743.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/19",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式説明書一覧でKJ-C481-Wの2026年5月発売と専用説明書を確認。説明書表紙の品番KJ-C481に対応します。31〜33ページで、本体・水タンクとふた・吸気口カバーのお手入れを月1回程度と確認しました。タンクは両手でしっかり持ち、フロートを絶対に外さず、フロート室の異物を確認します。ふたと排水口をしっかり閉め、奥まで確実に取り付けます（26〜27ページ）。内部乾燥は運転停止後や長期間使用しない場合に行うため、固定の日数による予定は設定しません。",
    "suggestions": [
      {
        "name": "本体のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114743.pdf#page=32",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書32ページ。本体は水洗いせず、水または40℃以下のぬるま湯を含ませてよく絞った柔らかい布で拭きます。落ちにくい汚れは薄めた中性洗剤を含ませた布で拭き、その後かたく絞った布で洗剤分を拭き取ります。"
      },
      {
        "name": "水タンク・水タンクふたの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114743.pdf#page=33",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書33ページ。水タンクふたを外して水洗いし、水気を拭いてよく乾かします。フロート室内のごみや異物は洗い流します。落ちにくい汚れは中性洗剤で洗い、よくすすぎます。フロートは絶対に外しません。ふたと排水口を閉めて奥まで確実に取り付けます。"
      },
      {
        "name": "吸気口カバー・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/114743.pdf#page=33",
        "conditions": "運転を停止して電源プラグを抜き、ぬれた手で抜き差ししません。酸性・アルカリ性洗剤、シンナー、ベンジン、漂白剤は使いません。説明書33ページ。吸気口カバー（エアフィルター）と本体の吸気口のほこりを掃除機で取り除きます。エアフィルターを傷めるためブラシ付きノズルは使いません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "気化式加湿器",
    "modelNumber": "AHM-MVU35A",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214884.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2026年9月発売と専用説明書を確認。表紙の基本品番AHM-MVU35Aに対応します。22〜31ページで月1回のお手入れを確認しました。水タンクは給水のたびに少量の水で振り洗いします（23ページ）。給水回数を固定の日数には置き換えません。お手入れランプは約720時間の動作で点灯するため、予定前でも点灯したら清掃し、説明書21ページのリセット操作を行います。本体は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体の吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214884.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いせず、吹き出し口と吸気口のごみを掃除機などで吸い取ります。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214884.pdf#page=24",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。水タンクから加湿フィルターを取り出して水洗いし、取り付けます。台所用洗剤を入れず、40℃以上のお湯は使いません。フィルターを付けずに使用しません。白いかたまり・水あか・においが残る場合の部品取り外し、クエン酸／重曹の使い分け、つけ置き・すすぎ・取り付けは説明書24〜29ページを確認してください。"
      },
      {
        "name": "ファンカバー・ファンの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214884.pdf#page=30",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。説明書の取り外し手順に従い、ファンカバーとファンを外して、柔らかいスポンジなどで水洗いします。本体は水洗いしません。ファンカバーの矢印をロック解除に合わせ、引き出す途中で出っ張りに当たったら斜めにして外します。"
      },
      {
        "name": "銀ビーズケースのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214884.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。上側の本体を真上に持ち上げて外し、下側の水タンクの水を捨てます。銀ビーズはタンク中央に入れたままにします。銀ビーズケースが浸る量のクエン酸水溶液を水タンクに入れ、2〜5分置いて水で洗い流します。水または40℃以下のぬるま湯2Lに市販のクエン酸約15gの比率でよく溶かし、濃度を高くしません。電気部品のある本体は水洗いしません。取り外す位置と手順は説明書31ページの図を確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "気化式加湿器",
    "modelNumber": "KHM-MVU401",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214882.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2026年9月発売と専用説明書を確認。表紙の基本品番KHM-MVU401に対応します。22〜31ページで月1回のお手入れを確認しました。水タンクは給水のたびに少量の水で振り洗いします（23ページ）。給水回数を固定の日数には置き換えません。お手入れランプは約720時間の動作で点灯するため、予定前でも点灯したら清掃し、説明書21ページのリセット操作を行います。本体は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体の吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214882.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いせず、吹き出し口と吸気口のごみを掃除機などで吸い取ります。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214882.pdf#page=24",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。水タンクから加湿フィルターを取り出して水洗いし、取り付けます。台所用洗剤を入れず、40℃以上のお湯は使いません。フィルターを付けずに使用しません。白いかたまり・水あか・においが残る場合の部品取り外し、クエン酸／重曹の使い分け、つけ置き・すすぎ・取り付けは説明書24〜29ページを確認してください。"
      },
      {
        "name": "ファンカバー・ファンの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214882.pdf#page=30",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。説明書の取り外し手順に従い、ファンカバーとファンを外して、柔らかいスポンジなどで水洗いします。本体は水洗いしません。ファンカバーの矢印をロック解除に合わせ、引き出す途中で出っ張りに当たったら斜めにして外します。"
      },
      {
        "name": "銀ビーズケースのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214882.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。上側の本体を真上に持ち上げて外し、下側の水タンクの水を捨てます。銀ビーズはタンク中央に入れたままにします。銀ビーズケースが浸る量のクエン酸水溶液を水タンクに入れ、2〜5分置いて水で洗い流します。水または40℃以下のぬるま湯2Lに市販のクエン酸約15gの比率でよく溶かし、濃度を高くしません。電気部品のある本体は水洗いしません。取り外す位置と手順は説明書31ページの図を確認してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "AHM-MHU40A",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211209.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売と専用説明書を確認。表紙の基本品番AHM-MHU40Aに対応します。水タンクは使用するたびに水洗いします（25ページ）。使用回数を固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。クエン酸洗浄は説明書25ページに従った専用の手順で行います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211209.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞ったやわらかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211209.pdf#page=27",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を外し、やわらかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。蒸気拡散板、蒸気カバー、上ぶたは説明書28〜29ページの図と順番に従って取り付けます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211209.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸20gをコップのぬるま湯で溶かし、水タンクに入れ、残りのぬるま湯を加えます（ぬるま湯の総量2L）。続いて満水線まで水を入れます。上ぶたを閉め、この洗浄手順では電源プラグを差し込み、電源を入れて「強」で2時間運転します。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書25ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "AHM-MHU60A",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211213.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売と専用説明書を確認。表紙の基本品番AHM-MHU60Aに対応します。水タンクは使用するたびに水洗いします（25ページ）。使用回数を固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。クエン酸洗浄は説明書25ページに従った専用の手順で行います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211213.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞ったやわらかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211213.pdf#page=27",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を外し、やわらかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。蒸気拡散板、蒸気カバー、上ぶたは説明書28〜29ページの図と順番に従って取り付けます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211213.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸30gをコップのぬるま湯で溶かし、水タンクに入れ、残りのぬるま湯を加えます（ぬるま湯の総量3L）。続いて満水線まで水を入れます。上ぶたを閉め、この洗浄手順では電源プラグを差し込み、電源を入れて「強」で2時間運転します。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書25ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "KHM-MHU401",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211210.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売と専用説明書を確認。表紙の基本品番KHM-MHU401に対応します。水タンクは使用するたびに水洗いします（25ページ）。使用回数を固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。クエン酸洗浄は説明書25ページに従った専用の手順で行います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211210.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞ったやわらかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211210.pdf#page=27",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を外し、やわらかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。蒸気拡散板、蒸気カバー、上ぶたは説明書28〜29ページの図と順番に従って取り付けます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211210.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸20gをコップのぬるま湯で溶かし、水タンクに入れ、残りのぬるま湯を加えます（ぬるま湯の総量2L）。続いて満水線まで水を入れます。上ぶたを閉め、この洗浄手順では電源プラグを差し込み、電源を入れて「強」で2時間運転します。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書25ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "KHM-MHU601",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211215.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売と専用説明書を確認。表紙の基本品番KHM-MHU601に対応します。水タンクは使用するたびに水洗いします（25ページ）。使用回数を固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。クエン酸洗浄は説明書25ページに従った専用の手順で行います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211215.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞ったやわらかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211215.pdf#page=27",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を外し、やわらかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。蒸気拡散板、蒸気カバー、上ぶたは説明書28〜29ページの図と順番に従って取り付けます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211215.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸30gをコップのぬるま湯で溶かし、水タンクに入れ、残りのぬるま湯を加えます（ぬるま湯の総量3L）。続いて満水線まで水を入れます。上ぶたを閉め、この洗浄手順では電源プラグを差し込み、電源を入れて「強」で2時間運転します。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書25ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "気化式加湿器",
    "modelNumber": "AHM-MVU55A",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209038.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年8月発売と専用説明書を確認。表紙の基本品番AHM-MVU55Aに対応します。22〜31ページで月1回のお手入れを確認しました。水タンクは給水のたびに少量の水で振り洗いします（23ページ）。給水回数を固定の日数には置き換えません。お手入れランプは約720時間の動作で点灯するため、予定前でも点灯したら清掃し、説明書21ページのリセット操作を行います。本体は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体の吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209038.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いせず、吹き出し口と吸気口のごみを掃除機などで吸い取ります。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209038.pdf#page=24",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。水タンクから加湿フィルターを取り出して水洗いし、取り付けます。台所用洗剤を入れず、40℃以上のお湯は使いません。フィルターを付けずに使用しません。白いかたまり・水あか・においが残る場合の部品取り外し、クエン酸／重曹の使い分け、つけ置き・すすぎ・取り付けは説明書24〜29ページを確認してください。"
      },
      {
        "name": "水タンク・ファンカバー・ファンの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209038.pdf#page=30",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。説明書の取り外し手順に従い、水タンク、ファンカバー、ファンを外して、柔らかいスポンジなどで水洗いします。本体は水洗いしません。ファンカバーの矢印をロック解除に合わせ、引き出す途中で出っ張りに当たったら斜めにして外します。"
      },
      {
        "name": "銀ビーズケースのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209038.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。上側の本体を真上に持ち上げて外し、下側の水タンクの水を捨てます。銀ビーズはタンク中央に入れたままにします。銀ビーズケースが浸る量のクエン酸水溶液を水タンクに入れ、2〜5分置いて水で洗い流します。水または40℃以下のぬるま湯3Lに市販のクエン酸約20gの比率でよく溶かし、濃度を高くしません。電気部品のある本体は水洗いしません。取り外す位置と手順は説明書31ページの図を確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "気化式加湿器",
    "modelNumber": "KHM-MVU601",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209039.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年8月発売と専用説明書を確認。表紙の基本品番KHM-MVU601に対応します。22〜31ページで月1回のお手入れを確認しました。水タンクは給水のたびに少量の水で振り洗いします（23ページ）。給水回数を固定の日数には置き換えません。お手入れランプは約720時間の動作で点灯するため、予定前でも点灯したら清掃し、説明書21ページのリセット操作を行います。本体は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体の吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209039.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いせず、吹き出し口と吸気口のごみを掃除機などで吸い取ります。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209039.pdf#page=24",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。水タンクから加湿フィルターを取り出して水洗いし、取り付けます。台所用洗剤を入れず、40℃以上のお湯は使いません。フィルターを付けずに使用しません。白いかたまり・水あか・においが残る場合の部品取り外し、クエン酸／重曹の使い分け、つけ置き・すすぎ・取り付けは説明書24〜29ページを確認してください。"
      },
      {
        "name": "水タンク・ファンカバー・ファンの掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209039.pdf#page=30",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。説明書の取り外し手順に従い、水タンク、ファンカバー、ファンを外して、柔らかいスポンジなどで水洗いします。本体は水洗いしません。ファンカバーの矢印をロック解除に合わせ、引き出す途中で出っ張りに当たったら斜めにして外します。"
      },
      {
        "name": "銀ビーズケースのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209039.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。上側の本体を真上に持ち上げて外し、下側の水タンクの水を捨てます。銀ビーズはタンク中央に入れたままにします。銀ビーズケースが浸る量のクエン酸水溶液を水タンクに入れ、2〜5分置いて水で洗い流します。水または40℃以下のぬるま湯3Lに市販のクエン酸約20gの比率でよく溶かし、濃度を高くしません。電気部品のある本体は水洗いしません。取り外す位置と手順は説明書31ページの図を確認してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "上給水超音波ハイブリッド加湿器",
    "modelNumber": "AHM-HUT55A",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112900.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年8月発売と専用説明書を確認。表紙の基本品番AHM-HUT55Aに対応します。使うたびに本体の残り水を説明書23ページの矢印方向から捨て、電源プラグに水をかけません。本体は水洗いせず、水タンク・ふた・蒸気筒を水洗いします。アロマトレー・アロマパッドも使用するたびに取り出して水洗いします（24ページ）。本体外側は定期的にやわらかい布で拭きます（26ページ）。毎使用と周期未指定の清掃は固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体内部・水位センサー・超音波振動子の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112900.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。付属のブラシまたは綿棒などでやさしく掃除します。超音波振動子に汚れや傷が付くと加湿量が低下するため、傷を付けないようにします。フロートが上下にスムーズに動くことを確認します。"
      },
      {
        "name": "ヒーター・カルキ防止用フェルトの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112900.pdf#page=25",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。ヒーターの汚れをやわらかい布などで拭き取ります。カルキ防止用フェルトは取り外して洗います。"
      },
      {
        "name": "吸気口の確認・ほこり取り",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112900.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。吸気口を確認し、ほこりがたまっていたら綿棒ややわらかい乾いた布などで取り除きます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112900.pdf#page=23",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。水タンクの水を捨て、水または40℃以下のぬるま湯3Lに市販のクエン酸20gの比率でよく溶かした水溶液を水タンクに入れます。2〜5分置いてから水で洗い流します。濃度を高くしません。電気部品のある本体は水洗いしません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "上給水超音波ハイブリッド加湿器",
    "modelNumber": "KHM-HUT551",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112902.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年8月発売と専用説明書を確認。表紙の基本品番KHM-HUT551に対応します。使うたびに本体の残り水を説明書26ページの矢印方向から捨て、電源プラグに水をかけません。本体は水洗いせず、水タンク・ふた・蒸気筒を水洗いします。アロマトレー・アロマパッドも使用するたびに取り出して水洗いします（27ページ）。本体外側は定期的にやわらかい布で拭きます（29ページ）。毎使用と周期未指定の清掃は固定の日数に置き換えません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使いません。",
    "suggestions": [
      {
        "name": "本体内部・水位センサー・超音波振動子の掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112902.pdf#page=28",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。付属のブラシまたは綿棒などでやさしく掃除します。超音波振動子に汚れや傷が付くと加湿量が低下するため、傷を付けないようにします。フロートが上下にスムーズに動くことを確認します。"
      },
      {
        "name": "ヒーター・カルキ防止用フェルトの掃除",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112902.pdf#page=28",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。ヒーターの汚れをやわらかい布などで拭き取ります。カルキ防止用フェルトは取り外して洗います。"
      },
      {
        "name": "吸気口の確認・ほこり取り",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112902.pdf#page=29",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。吸気口を確認し、ほこりがたまっていたら綿棒ややわらかい乾いた布などで取り除きます。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112902.pdf#page=26",
        "conditions": "運転を停止し、電源プラグをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。使用直後の水は熱いため注意してください。水タンクの水を捨て、水または40℃以下のぬるま湯3Lに市販のクエン酸20gの比率でよく溶かした水溶液を水タンクに入れます。2〜5分置いてから水で洗い流します。濃度を高くしません。電気部品のある本体は水洗いしません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "AHM-MH60",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/298878.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年12月発売と専用説明書を確認。表紙の基本品番AHM-MH60に対応します。14〜16ページのお手入れを確認しました。シンナー・ベンジン・洗剤・漂白剤は使いません。クエン酸洗浄のみ説明書14ページの専用手順に従います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/298878.pdf#page=16",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞った柔らかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/298878.pdf#page=15",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を取り外し、柔らかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。取り付けは説明書16ページの図と順番に従います。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/298878.pdf#page=14",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸30gを水または40℃以下のぬるま湯3Lでよく溶かし、水タンクに入れます。濃度を高くしません。満水線まで水を入れ、上ぶたを閉めます。この洗浄手順では電源プラグを差し込み、電源を入れ、加湿量「強」を選び、タイマーボタンで「2h」を選びます。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書14ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "スチーム式加湿器",
    "modelNumber": "KHM-MH60",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299193.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年12月発売と専用説明書を確認。表紙の基本品番KHM-MH60に対応します。14〜16ページのお手入れを確認しました。シンナー・ベンジン・洗剤・漂白剤は使いません。クエン酸洗浄のみ説明書14ページの専用手順に従います。",
    "suggestions": [
      {
        "name": "本体の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299193.pdf#page=16",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。よく絞った柔らかい布で拭き取ります。"
      },
      {
        "name": "上ぶた・蒸気カバー・蒸気拡散板の洗浄",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299193.pdf#page=15",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。上ぶたを約45度開け、着脱ボタンを押したまま斜め上に引き抜きます。蒸気カバーと蒸気拡散板を取り外し、柔らかいスポンジで洗い、水で流してよく乾かします。洗剤・金属へら・金属たわし・ナイロンたわし・スポンジのナイロン面・クレンザーは使いません。食器洗い乾燥機・食器乾燥器は使いません。上ぶたパッキンは外しません。取り付けは説明書16ページの図と順番に従います。"
      },
      {
        "name": "水タンクのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 60,
        "frequency": "2か月に1回（予定計算は60日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299193.pdf#page=14",
        "conditions": "運転を停止し、電源プラグをコンセントから抜き、完全に冷めてからお手入れを始めます。ぬれた手でプラグを抜き差ししません。クエン酸30gを水または40℃以下のぬるま湯3Lでよく溶かし、水タンクに入れます。濃度を高くしません。満水線まで水を入れ、上ぶたを閉めます。この洗浄手順では電源プラグを差し込み、電源を入れ、加湿量「強」を選び、タイマーボタンで「2h」を選びます。洗浄終了後、水タンクが完全に冷めてから湯を捨て、水ですすぎます。操作ボタンと順番は説明書14ページを確認してください。金属たわしや研磨剤入りスポンジは使いません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "AAP-AH50A",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年10月発売と専用説明書を確認。集じんフィルター・脱臭フィルターはお手入れできません。掃除機で吸ったり水洗いしたりせず、強く押したり丸めたりしません（37・42ページ）。排水トレーは水がたまったときに水を捨て、水洗いします。汚れが落ちにくいときは薄めた台所用中性洗剤を使い、十分にすすいでしっかり取り付けます（43ページ）。水がたまったときの作業は固定の日数に置き換えません。フィルターのお手入れ後はプラグを差し込み電源を入れてから、お手入れリセットボタンを約3秒押します（37ページ）。",
    "suggestions": [
      {
        "name": "水タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（加湿使用時）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=38",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。水タンクを取り外して水洗いします。汚れが落ちにくい場合は薄めた台所用中性洗剤を使い、洗剤が残らないよう十分にすすぎます。"
      },
      {
        "name": "加湿トレー・フロートまわりの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（加湿使用時）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=38",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。水タンクと加湿フィルターセットを外してトレーを水洗いします。フロートまわりの汚れは細めの綿棒などで落とします。トレーしきり・給水フロート・水位フロートは外しません。お手入れ後は逆の手順で取り付けます。"
      },
      {
        "name": "本体・前パネルの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=40",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。よく絞った柔らかい布で拭きます。"
      },
      {
        "name": "プレフィルターのほこり取り",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=40",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。前パネルとプレフィルターを取り外し、掃除機などで汚れを取ります。プレフィルターを外したまま運転しません。破損した場合は交換します。集じん・脱臭フィルターは掃除機で吸ったり水洗いしたりしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=41",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。分解せずに水洗いします。汚れが落ちにくい場合は水3Lにクエン酸大さじ2杯（約18g）の比率でつけ置き洗いします。取り外し・取り付け・持ち運びの際は水をこぼさないようにし、溝があるほうを後ろにして取り付けます。運転時は必ず加湿フィルターを取り付けます。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年に1回（条件付き目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289205.pdf#page=44",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。約2年に1回は1日8時間運転で定期的なお手入れをした場合の目安です。水質・使用状況により変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷み・縮みがひどい場合は早めに交換します。フィルター枠は捨てず、新しいフィルターをケースの溝に差し込み、ケースの5か所のつめを組み合わせて前後を確認して取り付けます。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "KAP-AH501",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年10月発売と専用説明書を確認。集じんフィルター・脱臭フィルターはお手入れできません。掃除機で吸ったり水洗いしたりせず、強く押したり丸めたりしません（38・43ページ）。排水トレーは水がたまったときに水を捨て、水洗いします。汚れが落ちにくいときは薄めた台所用中性洗剤を使い、十分にすすいでしっかり取り付けます（44ページ）。水がたまったときの作業は固定の日数に置き換えません。フィルターのお手入れ後はプラグを差し込み電源を入れてから、お手入れリセットボタンを約3秒押します（38ページ）。",
    "suggestions": [
      {
        "name": "水タンクの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（加湿使用時）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=39",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。水タンクを取り外して水洗いします。汚れが落ちにくい場合は薄めた台所用中性洗剤を使い、洗剤が残らないよう十分にすすぎます。"
      },
      {
        "name": "加湿トレー・フロートまわりの水洗い",
        "kind": "掃除",
        "intervalDays": 1,
        "frequency": "毎日（加湿使用時）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=39",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。水タンクと加湿フィルターセットを外してトレーを水洗いします。フロートまわりの汚れは細めの綿棒などで落とします。トレーしきり・給水フロート・水位フロートは外しません。お手入れ後は逆の手順で取り付けます。"
      },
      {
        "name": "本体・前パネルの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=41",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。よく絞った柔らかい布で拭きます。"
      },
      {
        "name": "プレフィルターのほこり取り",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=41",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。前パネルとプレフィルターを取り外し、掃除機などで汚れを取ります。プレフィルターを外したまま運転しません。破損した場合は交換します。集じん・脱臭フィルターは掃除機で吸ったり水洗いしたりしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=42",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。分解せずに水洗いします。汚れが落ちにくい場合は水3Lにクエン酸大さじ2杯（約18g）の比率でつけ置き洗いします。取り外し・取り付け・持ち運びの際は水をこぼさないようにし、溝があるほうを後ろにして取り付けます。運転時は必ず加湿フィルターを取り付けます。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年に1回（条件付き目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/289204.pdf#page=45",
        "conditions": "電源を切り、電源プラグを抜いてから行います。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。約2年に1回は1日8時間運転で定期的なお手入れをした場合の目安です。水質・使用状況により変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷み・縮みがひどい場合は早めに交換します。フィルター枠は捨てず、新しいフィルターをケースの溝に差し込み、ケースの5か所のつめを組み合わせて前後を確認して取り付けます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "上給水超音波加湿器",
    "modelNumber": "AHM-UU28B",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107242.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年8月発売と専用説明書を確認。表紙の基本品番AHM-UU28Bに対応します。使うたびにふた・ミストパイプを外し、本体内の吹き出し口に水が入らない排水方向（説明書20ページの図）で水を捨て、銀ビーズケースを取り出します。本体内部だけを、外側に水をかけず柔らかいスポンジなどで洗います。汚れに応じてふた・ミストパイプを分解して洗い、銀ビーズケースは開けずに流水で洗います。ミストパイプは注意書きのある上部のみ外します。銀ビーズケースをタンク中央に戻し、ミストパイプをしっかり押し込み、外側の水気を拭き取ります（19〜23ページ）。本体外側は定期的に柔らかい布で拭き、吸気口は本体のお手入れ時に確認してほこりがつまっていたら取り除きます。吸気口カバー・フィルターは水洗いか掃除機で清掃でき、水洗い後は十分乾燥させて戻します。フィルターなしで運転しません（26〜27ページ）。毎使用・周期未指定の作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "水位センサー・超音波振動子の掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107242.pdf#page=24",
        "conditions": "運転を停止し、電源プラグを抜いてから行います。ぬれた手で抜き差ししません。本体全体や外側は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。柔らかいブラシまたは綿棒などでやさしく掃除します。超音波振動子に汚れや傷が付くと加湿量が低下するため、傷を付けないようにします。"
      },
      {
        "name": "銀ビーズケースのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107242.pdf#page=24",
        "conditions": "運転を停止し、電源プラグを抜いてから行います。ぬれた手で抜き差ししません。本体全体や外側は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。ふた・ミストパイプを外し、本体内部の水を捨てます。銀ビーズケースはタンク中央に入れたままにします。水または40℃以下のぬるま湯3Lに市販のクエン酸20g（または大さじすりきり2杯）の比率でよく溶かし、銀ビーズケースが浸る量を本体内部に入れます。2〜5分置いてから水で洗い流します。濃度を高くしません。本体の外側や吹き出し口に水を入れません。銀ビーズケースは開けません。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "上給水超音波加湿器",
    "modelNumber": "KHM-UU281",
    "categoryId": "humidifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107243.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/20?page=3",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2024年8月発売と専用説明書を確認。表紙の基本品番KHM-UU281に対応します。使うたびにふた・ミストパイプを外し、本体内の吹き出し口に水が入らない排水方向（説明書20ページの図）で水を捨て、銀ビーズケースを取り出します。本体内部だけを、外側に水をかけず柔らかいスポンジなどで洗います。汚れに応じてふた・ミストパイプを分解して洗い、銀ビーズケースは開けずに流水で洗います。ミストパイプは注意書きのある上部のみ外します。銀ビーズケースをタンク中央に戻し、ミストパイプをしっかり押し込み、外側の水気を拭き取ります（19〜23ページ）。本体外側は定期的に柔らかい布で拭き、吸気口は本体のお手入れ時に確認してほこりがつまっていたら取り除きます。吸気口カバー・フィルターは水洗いか掃除機で清掃でき、水洗い後は十分乾燥させて戻します。フィルターなしで運転しません（26〜27ページ）。毎使用・周期未指定の作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "水位センサー・超音波振動子の掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107243.pdf#page=24",
        "conditions": "運転を停止し、電源プラグを抜いてから行います。ぬれた手で抜き差ししません。本体全体や外側は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。柔らかいブラシまたは綿棒などでやさしく掃除します。超音波振動子に汚れや傷が付くと加湿量が低下するため、傷を付けないようにします。"
      },
      {
        "name": "銀ビーズケースのクエン酸洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107243.pdf#page=24",
        "conditions": "運転を停止し、電源プラグを抜いてから行います。ぬれた手で抜き差ししません。本体全体や外側は水洗いしません。シンナー・ベンジン・酸性やアルカリ性の強い洗剤・漂白剤は使用しません。ふた・ミストパイプを外し、本体内部の水を捨てます。銀ビーズケースはタンク中央に入れたままにします。水または40℃以下のぬるま湯3Lに市販のクエン酸20g（または大さじすりきり2杯）の比率でよく溶かし、銀ビーズケースが浸る量を本体内部に入れます。2〜5分置いてから水で洗い流します。濃度を高くしません。本体の外側や吹き出し口に水を入れません。銀ビーズケースは開けません。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "AAP-S20C",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書の表紙に基本品番AAP-S20Cが記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（22ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S202（28ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S202です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "AAP-S30C",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書の表紙に基本品番AAP-S30Cが記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（22ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S302（28ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S302です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "AAP-S40A",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売を確認。共通説明書の表紙に基本品番AAP-S40Aが記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（22ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S40（28ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210171.pdf#page=23",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S40です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "KAP-S203",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書の表紙に基本品番KAP-S203が記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（21ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S202（27ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=21",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S202です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "KAP-S303",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書の表紙に基本品番KAP-S303が記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（21ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S302（27ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=21",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S302です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "空気清浄機",
    "modelNumber": "KAP-S401",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売を確認。共通説明書の表紙に基本品番KAP-S401が記載されています。集じん脱臭フィルターは汚れが気になったときに取り出し、外側の網状プレフィルターについたごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（21ページ）。汚れが気になったときの作業は固定の日数に置き換えません。交換用フィルターはFLS-S40（27ページ）。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=21",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210177.pdf#page=22",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。フィルター交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換用フィルターはFLS-S40です。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "AAP-SH20B",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書表紙に基本品番AAP-SH20Bが記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（27ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（26ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=26",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=29",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（30ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（31ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "AAP-SH30B",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書表紙に基本品番AAP-SH30Bが記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（27ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（26ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=26",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=29",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（30ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（31ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "AAP-SH40A",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年11月発売を確認。共通説明書表紙に基本品番AAP-SH40Aが記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（27ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（26ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=26",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=29",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（30ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（31ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210164.pdf#page=32",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "KAP-SH202",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書表紙に基本品番KAP-SH202が記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（26ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（25ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=25",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（29ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（30ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "KAP-SH302",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書表紙に基本品番KAP-SH302が記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（26ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（25ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=25",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（29ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（30ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "加湿空気清浄機",
    "modelNumber": "KAP-SH401",
    "categoryId": "air-purifier",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/21",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/21?page=2",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2025年9月発売を確認。共通説明書表紙に基本品番KAP-SH401が記載されています。水タンクは給水のたびに少量の水を入れて振り洗いします。汚れが気になる場合は加湿フィルターカバー・加湿フィルター・銀ビーズケースを外し、タンク内部を柔らかいスポンジなどで水洗いし、外側の水滴は拭き取ります（26ページ）。集じん脱臭フィルターは汚れが気になったとき、外側の網状プレフィルターのごみを掃除機などで取り除きます。集じん脱臭フィルターは絶対に水洗いせず、強く押しません。においが気になる場合は風通しのよい部屋でしばらく運転します（25ページ）。給水のたび・汚れたときの作業は固定の日数に置き換えません。",
    "suggestions": [
      {
        "name": "本体・吹き出し口・吸気口の掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=25",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。吹き出し口・吸気口のごみを掃除機などで吸い取ります。背面の吸気口も掃除します。その他の部分は柔らかい布などで汚れを拭きます。"
      },
      {
        "name": "ふた・加湿フィルターカバーの拭き掃除",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。よく絞った柔らかい布などで汚れを拭き取ります。"
      },
      {
        "name": "銀ビーズケースの洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=27",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクに銀ビーズケースが浸かる量のクエン酸水溶液を入れ、2〜5分置いてから水ですすぎます。40℃以下のぬるま湯3Lあたり市販のクエン酸20g（大さじすりきり2杯）が目安です。濃度を高くしません。"
      },
      {
        "name": "加湿フィルターの水洗い",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=28",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。水タンクから取り出して水洗いし、取り付けます。加湿フィルターに台所用洗剤を一緒に入れず、40℃以上のお湯を使用しません。加湿フィルターを取り付けずに運転しません。白いかたまりが取れにくいときは、3Lあたりクエン酸20gの水溶液（40℃未満）に30分〜2時間浸し、最長2時間を超えず新しい水でしっかりすすぎます（29ページ）。水あかが取れにくい・においがするときは、水3Lあたり重曹110g（大さじ12杯）の水溶液に約60分浸し、新しい水でしっかりすすぎます（30ページ）。クエン酸と重曹の処置は症状別で、混ぜて使用しません。"
      },
      {
        "name": "集じん脱臭フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（使用状況による目安・予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年はたばこを1日5本吸った場合の試験による目安で、運転頻度・設置場所・使いかたによって変わります。交換ランプが点灯したら交換します。お手入れしても煙やにおいが取れにくくなったら、ランプの点灯に関わらず早めに交換します。交換後はランプが点灯していなくても「モード」ボタンを長押ししてリセットします。"
      },
      {
        "name": "加湿フィルターの交換目安を確認",
        "kind": "交換",
        "intervalDays": 730,
        "frequency": "約2年（1日8時間運転・定期的なお手入れ時の目安、予定計算は730日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209803.pdf#page=31",
        "conditions": "運転を停止し、ACアダプターをコンセントから抜いてから行います。ぬれた手で抜き差ししません。本体は水洗いしません。洗剤・シンナー・ベンジン・漂白剤などは使用しません。約2年は1日8時間運転で定期的なお手入れをした場合の目安です。水質や使用状況で変わります。お手入れしてもにおいが取れない、水タンクの水が減らない、傷みや型くずれがひどい、白いかたまりが全面に付着した場合は早めに交換します。使用済みの加湿フィルターは不燃物として捨てます。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "AC式サイクロンスティッククリーナー",
    "modelNumber": "SCA-113",
    "categoryId": "vacuum",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/215097.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2026年9月発売、専用説明書表紙で基本品番SCA-113を確認。ダストカップのごみはごみすてラインを超える前に捨てます。ごみ量に応じた作業は固定の日数に置き換えません。排気フィルターのお手入れはこの機種専用の方法を使用します。お手入れしても吸引力が弱い場合は別売のフィルターを購入してください（30ページ）。固定の交換年数は設定していません。",
    "suggestions": [
      {
        "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/215097.pdf#page=25",
        "conditions": "必ず運転を停止し、電源コードをコンセントから抜いて行います。本体・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で、本体・延長パイプ・フロアヘッド外側・すき間ノズルなどを拭きます。"
      },
      {
        "name": "ダストカップ・フィルターのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/215097.pdf#page=26",
        "conditions": "必ず運転を停止し、電源コードをコンセントから抜いて行います。本体・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップを外してごみを捨て、排気フィルター・スポンジフィルター・サイクロンユニットを取り外します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいてごみを落とした後、水洗いします。排気フィルターはごみをはたき落とします。水洗いする部品に含めません。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジフィルターを中央のくぼみに入れて排気フィルターとサイクロンユニットを戻し、位置を合わせてダストカップをカチッと鳴るまで取り付けます。フィルター類を忘れずに取り付けます。"
      },
      {
        "name": "本体風路・延長パイプの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/215097.pdf#page=30",
        "conditions": "必ず運転を停止し、電源コードをコンセントから抜いて行います。本体・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      },
      {
        "name": "フロアヘッドの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/215097.pdf#page=30",
        "conditions": "必ず運転を停止し、電源コードをコンセントから抜いて行います。本体・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "充電式サイクロンスティッククリーナー",
    "modelNumber": "SCD-186P",
    "categoryId": "vacuum",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2026年8月発売、専用説明書表紙で基本品番SCD-186Pを確認。必ず電源を切り、運転を停止してから、ダストカップのごみをためずに掃除のたびに捨てます。ごみすてラインを超える前に捨てます。ごみ量に応じた作業は固定の日数に置き換えません。排気フィルターのお手入れはこの機種専用の方法を使用します。お手入れしても吸引力が弱い場合は別売のフィルターセットを購入してください（38ページ）。固定の交換年数は設定していません。",
    "suggestions": [
      {
        "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf#page=32",
        "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で、本体・延長パイプ・フロアヘッド外側・すき間ノズルなどを拭きます。"
      },
      {
        "name": "ダストカップ・フィルターのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf#page=33",
        "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップを外してごみを捨て、排気フィルター・スポンジフィルター・サイクロンユニットを取り外します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいてごみを落とした後、水洗いします。排気フィルターはごみをはたき落とした後、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジフィルターを中央のくぼみに入れて排気フィルターとサイクロンユニットを戻し、位置を合わせてダストカップをカチッと鳴るまで取り付けます。フィルター類を忘れずに取り付けます。"
      },
      {
        "name": "本体風路・延長パイプの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf#page=36",
        "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      },
      {
        "name": "フロアヘッドの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf#page=36",
        "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      },
      {
        "name": "回転ブラシのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213778.pdf#page=37",
        "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ブラシカバーのつめを押し下げて手前に引き、回転ブラシを持ち上げて取り外します。巻き付いた髪の毛はピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除きます。回転ブラシを水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。回転ブラシを戻し、ブラシカバーのつめをフロアヘッドの前端内側に引っかけてカチッと音がするまで押し込みます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "充電式サイクロンスティッククリーナー",
    "modelNumber": "SCD-186PS",
    "categoryId": "vacuum",
    "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "productLinkLabel": "公式製品・説明書一覧",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf",
    "manualLinkLabel": "取扱説明書",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
    "verifiedAt": "2026-10-10",
    "lookupNote": "公式一覧で2026年8月発売、専用説明書表紙で基本品番SCD-186PSを確認。必ず電源を切り、運転を停止してから、ダストカップのごみをためずに掃除のたびに捨てます。ごみすてラインを超える前に捨てます。ごみ量に応じた作業は固定の日数に置き換えません。排気フィルターのお手入れはこの機種専用の方法を使用します。お手入れしても吸引力が弱い場合は別売のフィルターセットを購入してください（42ページ）。固定の交換年数は設定していません。",
    "suggestions": [
      {
        "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf#page=36",
        "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で、本体・延長パイプ・フロアヘッド外側・すき間ノズル・充電スタンドなどを拭きます。"
      },
      {
        "name": "ダストカップ・フィルターのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf#page=37",
        "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップを外してごみを捨て、排気フィルター・スポンジフィルター・サイクロンユニットを取り外します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいてごみを落とした後、水洗いします。排気フィルターはごみをはたき落とした後、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすらないでください。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジフィルターを中央のくぼみに入れて排気フィルターとサイクロンユニットを戻し、位置を合わせてダストカップをカチッと鳴るまで取り付けます。フィルター類を忘れずに取り付けます。"
      },
      {
        "name": "本体風路・延長パイプの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf#page=40",
        "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      },
      {
        "name": "フロアヘッドの詰まり点検",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf#page=40",
        "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
      },
      {
        "name": "回転ブラシのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/213781.pdf#page=41",
        "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ブラシカバーのつめを押し下げて手前に引き、回転ブラシを持ち上げて取り外します。巻き付いた髪の毛はピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除きます。回転ブラシを水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。回転ブラシを戻し、ブラシカバーのつめをフロアヘッドの前端内側に引っかけてカチッと音がするまで押し込みます。"
      }
    ]
  }
] satisfies ProductCandidate[]);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-R5PD",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧のSCD-R5PD-HCで2026年9月発売、専用説明書表紙で基本品番SCD-R5PDを確認。ダストカップの週1回清掃、風路・ヘッド・回転ブラシの月1回清掃、ドックの2〜3か月清掃を区別しています。お手入れしても吸引力が弱い場合は別売品のフィルターを購入してください（40・43・44ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=37",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・ゴミ回収ドック・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=38",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップの取り外しボタンを押し、手前に引いて取り外します。ごみを捨て、サイクロンユニット・排気フィルター・スポンジフィルターを取り外します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいてごみを落として水洗いします。スポンジフィルターの汚れが気になるときは水に約30分浸してから洗います。排気フィルターはごみをはたき落とした後、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません（39ページ）。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジフィルターを中央のくぼみに入れて排気フィルターとサイクロンユニットを戻し、位置を合わせてダストカップをカチッと鳴るまで取り付けます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=42",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ブラシカバーのロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除きます。回転ブラシを水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。回転ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけてカチッと音がするまで押し込みます（43ページ）。"
    },
    {
      "name": "回収ドックのダストボックスのごみ捨て",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=34",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。必ず本体の電源を切り、運転を停止します。ゴミ回収ドックの運転中にダストボックスを取り外しません。ダストボックスを上に引いて外し、ごみ箱の上で側面のスイッチを押して底ふたを開け、側面をたたいてごみを落とします。底ふたをカチッと音がするまで閉じ、フィルター類を忘れずに取り付けてドックに戻します（35ページ）。"
    },
    {
      "name": "回収ドックのスポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=44",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ドックからスポンジフィルターと不織布フィルターを取り外します。スポンジフィルターは軽くはたいて水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。不織布フィルターは水洗いの対象に含めず交換します。"
    },
    {
      "name": "回収ドックの不織布フィルター交換",
      "kind": "交換",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/214991.pdf#page=44",
      "conditions": "必ず運転を停止し、本体をゴミ回収ドックから外して行います。本体・ゴミ回収ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ドックから不織布フィルターを取り外して新しいものに交換します。スポンジフィルターの水洗いとは区別します。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-124PD",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2026年4月発売、専用説明書表紙で基本品番を確認。静電モップ・ほこり感知センサー・ダストカップは週1回、風路・ヘッド・回転ブラシは月1回、ドックは2〜3か月に1回を区別しています。清掃後も吸引力が弱い場合は別売品のフィルターを購入してください（45・48・49ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・ドック・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・ゴミ収集ドック・静電モップの持ち手・すき間ノズルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。持ち手先端のボタンを押しながらモップを取り外し、モップ部分を水洗いします。よく水を切り、十分に乾かしてから戻します。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=42",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。割りばしなどに布を巻き付け、本体内部のセンサーを拭きます。位置は説明書の図で確認してください。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=42",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。底の取り外しボタンを押し、手前に引いてダストカップを外します。サイクロンユニットのメッシュフィルターはクリーニングブラシで掃除します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいて水洗いします。スポンジフィルターと排気フィルターの汚れが気になるときは水に約30分浸してから洗います。排気フィルターはごみをはたき落とし、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません（43ページ）。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジを中央のくぼみに入れ、排気フィルター・サイクロンユニット・ケースの位置を合わせます。カップ上部の穴を本体のつめに合わせ、カチッと鳴るまで取り付けます（44〜45ページ）。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=46",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=46",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=47",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除きます。回転ブラシを水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけます。カバーを押さえながらロックスイッチをスライドさせて固定します（48ページ）。"
    },
    {
      "name": "収集ドックのダストボックスのごみ捨て",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=38",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。本体の電源を切り、運転を停止します。ゴミ収集ドックの運転中にダストボックスを取り外しません。ダストボックスを上に引いて外し、ごみ箱の上で側面のスイッチを押して底ふたを開け、側面をたたいてごみを落とします。底ふたをカチッと音がするまで閉じ、フィルター類を忘れずに取り付けてドックに戻します（39ページ）。"
    },
    {
      "name": "収集ドックのスポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=49",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。スポンジフィルターと不織布フィルターを取り外します。スポンジフィルターは軽くはたいて水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。不織布フィルターは水洗いの対象に含めず交換します。"
    },
    {
      "name": "収集ドックの不織布フィルター交換",
      "kind": "交換",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212764.pdf#page=49",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。不織布フィルターを取り外して新しいものに交換します。スポンジフィルターの水洗いとは区別します。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-L4PD",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2026年4月発売、専用説明書表紙で基本品番を確認。静電モップ・ほこり感知センサー・ダストカップは週1回、風路・ヘッド・回転ブラシは月1回、ドックは2〜3か月に1回を区別しています。清掃後も吸引力が弱い場合は別売品のフィルターを購入してください（45・48・49ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・ドック・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・ゴミ収集ドック・静電モップの持ち手・すき間ノズルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=41",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。持ち手先端のボタンを押しながらモップを取り外し、モップ部分を水洗いします。よく水を切り、十分に乾かしてから戻します。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=42",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。割りばしなどに布を巻き付け、本体内部のセンサーを拭きます。位置は説明書の図で確認してください。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=42",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。底の取り外しボタンを押し、手前に引いてダストカップを外します。サイクロンユニットのメッシュフィルターはクリーニングブラシで掃除します。サイクロンユニット・ダストカップケース・スポンジフィルターは軽くはたいて水洗いします。スポンジフィルターと排気フィルターの汚れが気になるときは水に約30分浸してから洗います。排気フィルターはごみをはたき落とし、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません（43ページ）。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジを中央のくぼみに入れ、排気フィルター・サイクロンユニット・ケースの位置を合わせます。カップ上部の穴を本体のつめに合わせ、カチッと鳴るまで取り付けます（44〜45ページ）。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=46",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=46",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=47",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除きます。回転ブラシを水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけます。カバーを押さえながらロックスイッチをスライドさせて固定します（48ページ）。"
    },
    {
      "name": "収集ドックのダストボックスのごみ捨て",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=38",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。本体の電源を切り、運転を停止します。ゴミ収集ドックの運転中にダストボックスを取り外しません。ダストボックスを上に引いて外し、ごみ箱の上で側面のスイッチを押して底ふたを開け、側面をたたいてごみを落とします。底ふたをカチッと音がするまで閉じ、フィルター類を忘れずに取り付けてドックに戻します（39ページ）。"
    },
    {
      "name": "収集ドックのスポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=49",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。スポンジフィルターと不織布フィルターを取り外します。スポンジフィルターは軽くはたいて水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。不織布フィルターは水洗いの対象に含めず交換します。"
    },
    {
      "name": "収集ドックの不織布フィルター交換",
      "kind": "交換",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は早い側の60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212765.pdf#page=49",
      "conditions": "必ず運転を停止し、本体をゴミ収集ドックから外して行います。本体・ゴミ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。不織布フィルターを取り外して新しいものに交換します。スポンジフィルターの水洗いとは区別します。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックふとんクリーナー",
  "modelNumber": "FBD-41",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2026年2月発売、専用説明書表紙で基本品番を確認。本体と左右のセンサーは週1回、回転ブラシと紙パックホルダーは月1回、スポンジフィルターは3か月に1回。紙パックは水洗いしません。清掃しても吸引力が弱い場合は別売りのスポンジフィルターを購入してください（35ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・ヘッド外側・充電スタンドの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf#page=31",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。よく絞った柔らかい布で拭きます。"
    },
    {
      "name": "左右のほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf#page=31",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ダストパックセットを取り外し、本体内部の左右のセンサーを綿棒などで拭きます。位置は説明書の図で確認してください。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf#page=32",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ロックスイッチを押してカバーを外し、回転ブラシを持ち上げます。髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。ブラシを戻し、カバーのつめをヘッドの前端内側に引っかけ、カチッと鳴るまで押し込んで閉じます（33ページ）。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf#page=33",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ホルダーを点検し、汚れている場合は水洗いして十分に乾かします。紙パックは水洗いしません。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211188.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出し、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（35ページ）。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックふとんクリーナー",
  "modelNumber": "FBD-D1",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2026年1月発売、専用説明書表紙で基本品番を確認。本体と左右のセンサーは週1回、回転ブラシと紙パックホルダーは月1回、スポンジフィルターは3か月に1回。紙パックは水洗いしません。清掃しても吸引力が弱い場合は別売りのスポンジフィルターを購入してください（35ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・ヘッド外側・充電スタンドの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf#page=31",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。よく絞った柔らかい布で拭きます。"
    },
    {
      "name": "左右のほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf#page=31",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ダストパックセットを取り外し、本体内部の左右のセンサーを綿棒などで拭きます。位置は説明書の図で確認してください。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf#page=32",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ロックスイッチを押してカバーを外し、回転ブラシを持ち上げます。髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをヘッドの前端内側に引っかけ、カチッと鳴るまで押し込んで閉じます（33ページ）。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf#page=33",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ホルダーを点検し、汚れている場合は水洗いして十分に乾かします。紙パックは水洗いしません。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/211190.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから取り外して行います。本体・充電スタンド・充電アダプターには水をかけません。薄めた中性洗剤を使用できますが、シンナー・ベンジン・アルコールなど揮発性のものは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出し、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（35ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式ハンディクリーナー",
  "modelNumber": "HCD-23",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212120.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2026,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2026年1月発売、専用説明書表紙で基本品番を確認。本体の週1回拭き掃除、カップの2か月清掃、スポンジの3か月清掃を区別しています。排気フィルターをブラシなどでこすりません。汚れが気になる場合の浸し洗いは説明書24ページの図を確認してください。清掃後も吸引力が弱い場合は別売りの排気フィルターを購入してください（24ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・すき間ノズルの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212120.pdf#page=24",
      "conditions": "必ず運転を停止し、充電中はUSB充電ケーブルを本体から取り外して行います。本体・付属USBケーブルには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストカップ・排気フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2か月に1回程度（予定計算は60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212120.pdf#page=24",
      "conditions": "必ず運転を停止し、充電中はUSB充電ケーブルを本体から取り外して行います。本体・付属USBケーブルには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップを外し、フィルターカバーと排気フィルターを取り外します。ごみを落として水洗いします。排気フィルターはブラシなどでこすりません。汚れが気になる場合の浸し洗いは説明書の図を確認してください。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。フィルター類を戻してダストカップを取り付けます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/212120.pdf#page=25",
      "conditions": "必ず運転を停止し、充電中はUSB充電ケーブルを本体から取り外して行います。本体・付属USBケーブルには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストカップを外し、取付部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。フィルターの全周をすき間のないように押し込み、必ず取り付けます。ダストカップを戻します（26ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "HBD-41",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年11月発売、専用説明書表紙で基本品番を確認。本体などの週1回拭き掃除、ホルダー・風路・ヘッドの月1回点検、スポンジの3か月清掃を区別しています。紙パックは水洗いしません。清掃後も吸引力が弱い場合はスポンジフィルターを交換してください（31ページ）。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf#page=30",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、ホルダーを点検します。汚れている場合はホルダーを水洗いして十分に乾かします。紙パックは水洗いしません。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210537.pdf#page=32",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（33ページ）。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-78DCBLP",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年11月発売、専用説明書表紙で基本品番を確認。各機種の清掃周期・回転ブラシの取り外し方法を専用説明書で照合しています。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。静電モップのハンドルも拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ハンドルを取り外し、モップ部分を水洗いします。しっかり水を切り、よく乾かしてから戻します。モップ帯電ケースの月1回清掃とは区別します。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、ホルダーを点検します。汚れている場合は使い捨てダストパックを外して、ホルダーを水洗いして十分に乾かします。使い捨てダストパックは水洗いしません。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。カバーのつめを押し下げて後ろに引き、カバーを開きます。回転ブラシを横側から引き出します。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを横側から戻し、カバーのつめをフロアヘッドの内側に引っかけて固定します（41ページ）。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。静電モップもハンドル先端のボタンを押しながらモップ部分を引き抜いて洗えます。モップ部分は週1回を目安に洗い、ケースは月1回を目安に洗います。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210913.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（43ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-202P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。各機種の清掃周期・回転ブラシの取り外し方法を専用説明書で照合しています。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。静電モップのハンドルも拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ハンドルを取り外し、モップ部分を水洗いします。しっかり水を切り、よく乾かしてから戻します。モップ帯電ケースの月1回清掃とは区別します。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。割りばしに布などを巻き付け、本体内部のほこり感知センサーを拭きます。位置は専用説明書の図で確認してください。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、ホルダーを点検します。汚れている場合は使い捨てダストパックを外して、ホルダーを水洗いして十分に乾かします。使い捨てダストパックは水洗いしません。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめを前端内側に引っかけ、カバーを押し込みながらロックスイッチをスライドさせて固定します（46ページ）。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。静電モップもハンドル先端のボタンを押しながらモップ部分を引き抜いて洗えます。モップ部分は週1回を目安に洗い、ケースは月1回を目安に洗います。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209762.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（48ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-78P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。各機種の清掃周期・回転ブラシの取り外し方法を専用説明書で照合しています。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=33",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、ホルダーを点検します。汚れている場合は使い捨てダストパックを外して、ホルダーを水洗いして十分に乾かします。使い捨てダストパックは水洗いしません。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=35",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=36",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。カバーのつめを押し下げて手前に引き、カバーを取り外します。回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめを前端内側に引っかけ、カチッと音がするまで押し込みます（37ページ）。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210062.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（39ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-230P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。各機種の清掃周期・回転ブラシの取り外し方法を専用説明書で照合しています。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。静電モップのハンドルも拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ハンドルを取り外し、モップ部分を水洗いします。しっかり水を切り、よく乾かしてから戻します。モップ帯電ケースの月1回清掃とは区別します。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。割りばしに布などを巻き付け、本体内部のほこり感知センサーを拭きます。位置は専用説明書の図で確認してください。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。底の取り外しボタンを押してロックを外し、カップを手前に引いて取り外します。ボタンを押さずに無理に外しません。サイクロンユニット・排気フィルター・スポンジフィルターを外します。サイクロンユニット・ケース・スポンジは軽くはたいて水洗いします。排気フィルターはごみをはたき落とし、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジをサイクロンユニット中央のくぼみに入れ、排気フィルター・サイクロン・ケースの位置を合わせて組み立てます。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。手順の続きは44〜46ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。カバーのつめを押し上げてカバーを外し、回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめを前端内側に引っかけ、カチッと音がするまで押し込みます（49ページ）。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210307.pdf#page=49",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。静電モップもハンドル先端のボタンを押しながらモップ部分を引き抜いて洗えます。モップ部分は週1回を目安に洗い、ケースは月1回を目安に洗います。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-124P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=2",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。各機種の清掃周期・回転ブラシの取り外し方法を専用説明書で照合しています。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。静電モップのハンドルも拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ハンドルを取り外し、モップ部分を水洗いします。しっかり水を切り、よく乾かしてから戻します。モップ帯電ケースの月1回清掃とは区別します。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。割りばしに布などを巻き付け、本体内部のほこり感知センサーを拭きます。位置は専用説明書の図で確認してください。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。底の取り外しボタンを押してロックを外し、カップを手前に引いて取り外します。ボタンを押さずに無理に外しません。サイクロンユニット・排気フィルター・スポンジフィルターを外します。サイクロンユニット・ケース・スポンジは軽くはたいて水洗いします。排気フィルターはごみをはたき落とし、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。スポンジをサイクロンユニット中央のくぼみに入れ、排気フィルター・サイクロン・ケースの位置を合わせて組み立てます。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。手順の続きは45〜47ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=49",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ロックスイッチを横にスライドさせてカバーを外し、回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめを前端内側に引っかけ、カチッと音がするまで押し込みます（50ページ）。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209066.pdf#page=50",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。静電モップもハンドル先端のボタンを押しながらモップ部分を引き抜いて洗えます。モップ部分は週1回を目安に洗い、ケースは月1回を目安に洗います。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックハンディクリーナー",
  "modelNumber": "HBD-C1",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209089.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年7月発売、専用説明書表紙で基本品番を確認。本体などの週1回拭き掃除、月1回のホルダー点検、3か月ごとのスポンジ洗浄を区別しています。清掃後も吸引力が弱い場合はスポンジフィルターを交換してください。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・充電スタンド・すき間ノズル・フレキシブルホースの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209089.pdf#page=28",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・充電スタンド・すき間ノズル・フレキシブルホースなどを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209089.pdf#page=28",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外してホルダーを点検します。汚れている場合は使い捨てダストパックを外し、ホルダーを水洗いします。水洗い後はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。使い捨てダストパックは取り替えます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209089.pdf#page=29",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗い後はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（30ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックハンディクリーナー",
  "modelNumber": "HBD-31",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209088.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年7月発売、専用説明書表紙で基本品番を確認。本体などの週1回拭き掃除、月1回のホルダー点検、3か月ごとのスポンジ洗浄を区別しています。清掃後も吸引力が弱い場合はスポンジフィルターを交換してください。固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・充電スタンド・すき間ノズルの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209088.pdf#page=27",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・充電スタンド・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209088.pdf#page=27",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外してホルダーを点検します。汚れている場合は使い捨てダストパックを外し、ホルダーを水洗いします。水洗い後はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。使い捨てダストパックは取り替えます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209088.pdf#page=28",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗い後はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（29ページ）。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-G5P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。静電モップは週1回、ケースは月1回、スポンジフィルターは3か月ごとの清掃を提案します。回転ブラシはスライド式のロックスイッチで解除・再固定します。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ハンドルを取り外し、モップ部分を水洗いします。しっかり水を切り、よく乾かしてから戻します。モップ帯電ケースは月1回清掃します。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを取り外してホルダーを点検します。汚れている場合は使い捨てダストパックを取り外し、ホルダーを水洗いして十分に乾かします。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ブラシカバーのロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけ、カバーを取り付けてロックスイッチで固定します（41ページ）。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。モップ部分はハンドル先端のボタンを押しながら引き抜いて洗えます。モップは週1回、ケースは月1回を目安に洗います。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210064.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ダストパックセットを外し、収納部の奥からスポンジフィルターをつまんで取り出して水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。収納部の奥に必ず取り付け、フィルターの全周をすき間のないように押し込みます。ダストパックセットを戻し、カバーをしっかり閉めます（43ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-R4P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年10月発売、専用説明書表紙で基本品番を確認。静電モップは月1回、ダストカップは月1回。排気フィルターの汚れが気になる場合は約30分浸し洗いします。回転ブラシはスライド式のロックスイッチで解除・再固定します。清掃しても吸引力が弱い場合のフィルター交換は使用状況によるため、固定の交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・スタンド・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。底の取り外しボタンを押してロックを外し、カップを手前に引いて外します。ボタンを押さずに無理に外しません。サイクロンユニット・排気フィルター・スポンジを外し、サイクロン上部を反時計回りに回して上下に分解します。上部のメッシュはクリーニングブラシで手入れします。サイクロン上下・ケース・スポンジはごみをはたいて水洗いします。排気フィルターの汚れが気になる場合は水に約30分浸してから水洗いします。排気フィルターのごみをはたき落とし、ブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。サイクロン上下をはめ込み、時計回りに回して取り付けます。スポンジを中央のくぼみに入れ、排気フィルター・サイクロン・ケースの凸部や切り欠きを合わせて組み立てます。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。手順の続きは41〜42ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。吸い込み口と内部を点検し、ごみが詰まっていたらピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。ブラシカバーのロックスイッチをスライドさせて解除し、カバーを外して回転ブラシを持ち上げます。巻き付いた髪の毛をピンセットで取り除き、絡まったごみはブラシの溝に沿ってはさみで切って取り除き、水洗いします。水洗いした部品はよく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけ、カバーを取り付けてロックスイッチで固定します（45ページ）。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/210061.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使用しません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かしてから戻します。ハンドル先端のボタンを押しながらモップ部分を引き抜き、水洗いしてよく水を切り、よく乾かしてから戻します。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "布団クリーナー",
  "modelNumber": "FCA-31PZ1",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209040.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年5月発売、専用説明書表紙で基本品番を確認。週1回の本体・センサー清掃と月1回のヘッド清掃を提案します。カップはこまめにごみを捨てて洗います（20〜22ページ）。使い捨てフィルターを外して捨て、カップ・フィルターセットを流水で洗い、風通しのよい日陰で十分に乾かします。洗濯機・ドライヤーは使いません。フィルターセットは捨てず、向きに注意して戻し、左右のレバーが両方かかるまでカップを取り付けます。カップ洗浄の固定周期やフィルター交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・ヘッド外側の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209040.pdf#page=24",
      "conditions": "必ず運転を停止し、電源プラグを抜いて行います。本体には水をかけません。洗剤を使う場合は中性洗剤を薄めます。シンナー・ベンジン・アルコールなど揮発性のあるものは使いません。よく絞った柔らかい布で本体とヘッドの外側を拭きます。"
    },
    {
      "name": "ダニちりセンサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209040.pdf#page=24",
      "conditions": "必ず運転を停止し、電源プラグを抜いて行います。本体には水をかけません。洗剤を使う場合は中性洗剤を薄めます。シンナー・ベンジン・アルコールなど揮発性のあるものは使いません。ダストカップを取り外し、左右のダニちりセンサーを綿棒などで拭きます。ごみが付くと誤動作の原因になります。"
    },
    {
      "name": "ヘッドのローラー・毛取りブラシ・たたきパッド・吸引口のお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209040.pdf#page=25",
      "conditions": "必ず運転を停止し、電源プラグを抜いて行います。本体には水をかけません。洗剤を使う場合は中性洗剤を薄めます。シンナー・ベンジン・アルコールなど揮発性のあるものは使いません。ローラーや毛取りブラシに絡み付いた毛・糸くず、吸引口に詰まったごみをピンセットなどで取り除きます。たたきパッドの汚れは柔らかいブラシなどで取り除きます。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式スティッククリーナー",
  "modelNumber": "SBD-200PN",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年4月発売、専用説明書の表紙と清掃ページを確認。清掃周期・取り外し手順は専用説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・すき間ノズルの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=29",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=30",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。吸い込み口内部の左右にあるセンサーを、綿棒または割りばしに布などを巻き付けて拭きます。水洗いせず、説明書30ページの拭き取り手順に従います。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。内部を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=32",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ブラシカバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げ、巻き付いたごみをハサミやピンセットで取り除きます。絡まったごみはブラシの溝に沿って切り、水洗いします。よく水を切り、風通しのよい場所に24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。洗浄と再取り付けは33ページを確認してください。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=34",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ダストパックセットを取り外してホルダーを点検します。汚れた場合は紙パックを外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208703.pdf#page=35",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ダストパックセットを外し、収納部奥からスポンジをつまんで取り出して水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。奥に戻し、全周をすき間のないように押し込みます。フィルターを必ず取り付け、ダストパックセットを戻してカバーをしっかり閉めます（36ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-P3P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209002.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年4月発売、専用説明書の表紙と清掃ページを確認。清掃周期・取り外し手順は専用説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・ヘッド外側・スタンド・すき間ノズルの拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209002.pdf#page=35",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。充電スタンド・充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布でスティック・ハンディ本体、ヘッド外側、充電スタンド、すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209002.pdf#page=36",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。充電スタンド・充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。取り外しボタンを押し、カップをハンドルから外します。ハンドルのスポンジとカップケースのフィルターカバー・排気フィルターを外します。ケース・カバー・スポンジはごみを軽くたたき落として水洗いします。排気フィルターはごみをたたき落とし、水に約30分浸した後に流水を当てて洗います。ブラシなどでこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ドライヤーなどの熱風を当てません。排気の凸部とカバーの切り欠きを合わせ、カバーをケースの形に合わせてはめます。スポンジをハンドルに戻し、カップ背面の穴をハンドルのつめに引っかけ、カチッというまで押し込みます。フィルター類を忘れずに取り付けます。手順の続きは37〜39ページを確認してください。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209002.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。充電スタンド・充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。吸い込み口と内部を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209002.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。充電スタンド・充電アダプターには水をかけません。本体には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ブラシカバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げ、巻き付いたごみをハサミやピンセットで取り除きます。絡まったごみはブラシの溝に沿って切り、水洗いします。よく水を切り、風通しのよい場所に24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。洗浄と再取り付けは42ページを確認してください。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-T3P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年8月発売、専用説明書の表紙と清掃ページを確認。機種ごとの清掃周期・洗浄・再取り付け手順に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・静電モップハンドル・すき間ノズルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ハンドルの取り外し図は45ページを確認してください。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、ほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。37ページのごみ捨て手順でダストパックセットを取り外します。ホルダーが汚れた場合は紙パックを外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ブラシカバーのロックスイッチをスライドさせて解除し、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。回転ブラシを戻し、カバーのつめをフロアヘッドの前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは45ページを確認してください。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かします。モップ部の洗浄は別の週次項目で管理します。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209850.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。37ページの手順でダストパックセットを外し、収納部奥からスポンジをつまんで取り出して水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。奥に戻し、全周をすき間のないように押し込みます。フィルターを必ず取り付け、ダストパックセットを戻してカバーをしっかり閉めます（47ページ）。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-L4P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年8月発売、専用説明書の表紙と清掃ページを確認。機種ごとの清掃周期・洗浄・再取り付け手順に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・静電モップハンドル・すき間ノズルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ハンドルの取り外し図は48ページを確認してください。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、ほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いします。強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは44〜45ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ブラシカバーのロックスイッチをスライドさせて解除し、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。回転ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カバーを押し込み、ロックスイッチをスライドさせて固定します。再取り付けは48ページを確認してください。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/209220.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。モップ帯電ケースを水洗いし、よく水を切り、よく乾かします。モップ部の洗浄は別の週次項目で管理します。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-U2P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2025,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=3",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2025年1月発売、専用説明書の表紙と清掃ページを確認。機種ごとの清掃周期・洗浄・再取り付け手順に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・静電モップハンドル・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、ほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ取り外しボタンをスライドさせ、前に引き出して外します。ボタンをスライドさせずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外し、ユニット上を反時計回りに回して上下に分解します。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめて時計回りに回し、中央のくぼみにスポンジ、次に排気を取り付け、ケースに戻します。カップ下端の凸部を本体のつめに引っかけ、カップ上部をカチッと鳴るまで押し込み、取り外しボタンが確実に閉まっていることを確認します。続きは43〜45ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=49",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを上に引き上げます。回転ブラシを取り外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。回転ブラシを回転軸に差し込み、カバーをカチッと音がするまで押し込みます。洗浄と再取り付けは47ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/208375.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。モップ帯電ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-220",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/205900.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年10月発売、専用説明書の表紙と清掃ページを確認。機種ごとの清掃周期と取り外し・洗浄・再取り付け手順に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/205900.pdf#page=30",
      "conditions": "必ず運転を停止し、USB充電ケーブルを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/205900.pdf#page=31",
      "conditions": "必ず運転を停止し、USB充電ケーブルを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップを反時計回りに回し、本体の三角マークと開いた鍵マークを合わせ、下に引いて外します。無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。サイクロンユニット・ケース・スポンジ・排気フィルターは、ごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。本体の三角マークと開いた鍵マークを合わせてカップを差し込み、時計回りに回し、三角マークと閉じた鍵マークを合わせて確実にはめ込みます。フィルター類を忘れずに取り付けます。続きは32〜33ページの図を確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/205900.pdf#page=34",
      "conditions": "必ず運転を停止し、USB充電ケーブルを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/205900.pdf#page=34",
      "conditions": "必ず運転を停止し、USB充電ケーブルを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-185P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年5月発売、専用説明書の表紙と清掃ページを確認。機種ごとの清掃周期と取り外し・洗浄・再取り付け手順に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf#page=30",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf#page=31",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外し、ユニット上を反時計回りに回して上下に分解します。サイクロンユニット・ケース・スポンジ・排気フィルターは、ごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは32〜33ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf#page=34",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf#page=34",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202399.pdf#page=35",
      "conditions": "必ず運転を停止し、充電アダプターを本体から抜いて行います。本体・充電機器には水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは36ページを確認してください。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-77P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年9月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=33",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ホルダーが汚れた場合は使い捨てダストパックを取り外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=34",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=35",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=36",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは37ページを確認してください。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206015.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従ってダストパックセットを外し、スポンジフィルターを取り出して水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。スポンジフィルターは必ず取り付けます。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-G4P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年9月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズルなどを拭きます。静電モップハンドルも拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。取り外し図は41ページを確認してください。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ホルダーが汚れた場合は使い捨てダストパックを取り外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは41ページを確認してください。"
    },
    {
      "name": "モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ケースを水洗いし、よく水を切り、よく乾かします。モップ部の洗浄は別の週次項目で管理します。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206016.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従ってダストパックセットを外し、スポンジフィルターを取り出して水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。スポンジフィルターは必ず取り付けます。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-122PMA",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年11月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。ミニヘッド・ブラシノズル・フレキシブルホース外側も拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、左右のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは44〜45ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは48ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/207018.pdf#page=48",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-R3P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年9月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは42〜43ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは46ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/203683.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-L3PD",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=4",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年11月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=40",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・ごみ収集ドック・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=40",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=40",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、内部のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=41",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは42〜43ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=44",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=44",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=45",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは46ページを確認してください。"
    },
    {
      "name": "ごみ収集ドックのスポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=47",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ドックからスポンジフィルターと不織布フィルターを取り外します。スポンジは軽くはたいて水洗いし、よく水を切って風通しのよい場所に約24時間置き、十分に乾かします。フィルター類を忘れずに戻します（38ページ）。不織布は別の交換項目で管理します。"
    },
    {
      "name": "ごみ収集ドックの不織布フィルター交換",
      "kind": "交換",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=47",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ドックから不織布フィルターを外して交換します。水洗いするスポンジとは別の部品です。フィルター類を忘れずに取り付けます（38ページ）。"
    },
    {
      "name": "ごみ収集ドックのごみ捨て",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2〜3か月に1回程度（予定計算は60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/206147.pdf#page=37",
      "conditions": "必ず本体とごみ収集ドックの運転を停止し、本体をドックから外して行います。本体・ごみ収集ドック・電源コードには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。運転中はダストボックスを外しません。ボックスを上に引いて外し、ごみ箱の上で側面のスイッチを押して底ふたを開け、側面をたたいてごみを落とします。底ふたをカチッと鳴るまで閉め、ボックスをドックに戻します。フィルター類を忘れずに取り付けます（38ページ）。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-185PM",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年5月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気の汚れが気になる場合は水に約30分浸してから洗います。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは43〜44ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは47ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/202401.pdf#page=47",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-201P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年3月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。水または40℃以下のぬるま湯を含ませた柔らかい布をよく絞り、本体・延長パイプ・フロアヘッド外側・充電スタンド・静電モップハンドル・すき間ノズルを拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドルを取り外し、モップ部を水洗いしてしっかり水を切り、よく乾かします。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。吸い込み口内部左右のセンサーを、割りばしに布などを巻いて拭きます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "ヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従い、つめを解除してブラシカバーを開き、回転ブラシを取り外して水洗いします。巻き付いた髪の毛はピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、取り除きます。再取り付けは説明書の図を確認してください。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ホルダーが汚れた場合は使い捨てダストパックを取り外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201506.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従いダストパックセットを外してスポンジを取り出し、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。スポンジフィルターは必ず取り付けます。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式紙パックスティッククリーナー",
  "modelNumber": "SBD-T2P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年3月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。水または40℃以下のぬるま湯を含ませた柔らかい布をよく絞り、本体・延長パイプ・フロアヘッド外側・充電スタンド・静電モップハンドル・すき間ノズル・マルチパワーヘッド外側を拭きます。"
    },
    {
      "name": "静電モップのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドルを取り外し、モップ部を水洗いしてしっかり水を切り、よく乾かします。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。吸い込み口内部左右のセンサーを、割りばしに布などを巻いて拭きます。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "ヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド・マルチパワーヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従い、つめを解除してブラシカバーを開き、回転ブラシを取り外して水洗いします。巻き付いた髪の毛はピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、取り除きます。再取り付けは説明書の図を確認してください。"
    },
    {
      "name": "ダストパックホルダーのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ホルダーが汚れた場合は使い捨てダストパックを取り外し、ホルダーを水洗いしてよく乾燥させます。"
    },
    {
      "name": "スポンジフィルター洗浄",
      "kind": "掃除",
      "intervalDays": 90,
      "frequency": "3か月に1回程度（予定計算は90日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/201507.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。説明書の図に従いダストパックセットを外してスポンジを取り出し、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。スポンジフィルターは必ず取り付けます。"
    }
  ]
} satisfies ProductCandidate);



catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-123P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2023,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2023年12月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、内部のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは40〜41ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは44ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299188.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-L3P",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2023,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2023年12月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。マルチパワーヘッド外側も拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=40",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、内部のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=41",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは42〜43ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッド・マルチパワーヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。マルチパワーヘッドの吸い込み口と内部も点検します。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=45",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。巻き付いた髪の毛をピンセットで取り、絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは46ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299189.pdf#page=46",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー",
  "modelNumber": "SCD-122PM",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299995.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2023,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2023年11月発売、専用説明書の表紙と清掃ページを確認。周期・洗浄・再取り付け手順は機種ごとの説明書に基づきます。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。本体風路・延長パイプ、フロアヘッド、回転ブラシ、静電モップ・帯電ケースは「汚れが目立ってきたら」のため固定周期の候補には含めていません。説明書41〜43ページを確認し、必要なときに手入れしてください。風路・ヘッドの詰まりをピンセット等で取り除き、ブラシは取り外して洗浄後約24時間十分に乾燥。モップ・ケースは水洗いしてよく乾かします。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299995.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299995.pdf#page=37",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、内部のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 60,
      "frequency": "2か月に1回程度（予定計算は60日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299995.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは39〜40ページを確認してください。"
    }
  ]
} satisfies ProductCandidate);

catalog.push(...[
  {
    "maker": "Panasonic",
    "name": "タンク式スリムタイプ食器洗い乾燥機",
    "modelNumber": "NP-TSP2",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TSP2.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://panasonic.jp/dish/feature/SLIM/wash.html",
    "manualLinkLabel": "公式お手入れ案内",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://panasonic.jp/dish/comparison.html",
    "lookupNote": "公式比較表で2026年9月発売を確認。公式製品ページのお手入れ案内に基づく提案です。月2〜3回の庫内清掃は予定計算を15日にしています。給水タンクは汚れが気になったときに専用クリーナーで清掃し、固定周期は設定していません。作業前にお手持ちの説明書で安全上の注意と取り外し・取り付け方法を確認してください。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回程度（1日2回使用時・予定計算は7日）",
        "sourceKind": "メーカー公式",
        "sourceUrl": "https://panasonic.jp/dish/feature/SLIM/wash.html",
        "conditions": "フィルターを外し、小さいブラシで付着した汚れを取り除きます。使用回数や汚れの状態に応じて予定前でも掃除してください。作業は運転終了後に庫内が冷えてから行い、取り付け方法はお手持ちの説明書で確認してください。"
      },
      {
        "name": "庫内のお手入れ",
        "kind": "掃除",
        "intervalDays": 15,
        "frequency": "月に2〜3回（予定計算は15日）",
        "sourceKind": "メーカー公式",
        "sourceUrl": "https://panasonic.jp/dish/feature/SLIM/wash.html",
        "conditions": "食器を入れず、通常の使用量の2倍の食器洗い機専用洗剤を入れ、設定ボタンで汚れレベル3を選んで運転します。給水タンクの汚れの清掃とは別の作業です。"
      }
    ]
  },
  {
    "maker": "Panasonic",
    "name": "プチタイプ食器洗い乾燥機",
    "modelNumber": "NP-TCR5",
    "categoryId": "dishwasher",
    "productUrl": "https://panasonic.jp/dish/products/NP-TCR5.html",
    "productLinkLabel": "公式製品ページ",
    "manualUrl": "https://jpn.faq.panasonic.com/app/answers/detail/a_id/26688/kw/%E6%8E%92%E6%B0%B4/p/1777",
    "manualLinkLabel": "公式お手入れ案内",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://panasonic.jp/dish/comparison.html",
    "lookupNote": "公式比較表で2023年11月発売を確認。周期は卓上型食洗機の公式FAQ、フィルターの洗い方はこの品番の公式製品ページを参照しています。庫内は汚れたときに標準コースで清掃します。固定周期の庫内清掃や、他機種の汚れレベル3・自動投入タンクの清掃は提案していません。作業前にお手持ちの説明書で安全上の注意と取り外し・取り付け方法を確認してください。",
    "suggestions": [
      {
        "name": "残さいフィルターの掃除",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週に1回・運転終了後に残さいがあるとき",
        "sourceKind": "メーカー公式",
        "sourceUrl": "https://jpn.faq.panasonic.com/app/answers/detail/a_id/62136/p/1776/related/1",
        "conditions": "この品番の公式製品ページでは、フィルターを外し、残さいを捨てて水洗いし、落ちにくい汚れをブラシで落とす方法を案内しています。取り外した下に残さいがあれば除きます。作業は庫内が冷えてから行い、お手入れ後は元どおり取り付けてください。"
      },
      {
        "name": "本体の外側・パッキンのお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）",
        "sourceKind": "メーカー公式",
        "sourceUrl": "https://jpn.faq.panasonic.com/app/answers/detail/a_id/26688/kw/%E6%8E%92%E6%B0%B4/p/1777",
        "conditions": "かごを取り出し、よく絞った柔らかい布でパッキン、パッキンが当たる面、ドアのふちに付いた汚れを拭き取ります。安全上の注意はお手持ちの説明書で確認してください。"
      },
      {
        "name": "残さいフィルター下のお手入れ",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月に1回（予定計算は30日）・汚れが気になるとき",
        "sourceKind": "メーカー公式",
        "sourceUrl": "https://jpn.faq.panasonic.com/app/answers/detail/a_id/62136/p/1776/related/1",
        "conditions": "フィルターの下に残さいや汚れがないか確認します。柔らかいブラシなどでお手入れし、柔らかい布で拭いてからフィルターを元どおり取り付けます。取り外せない部品を外さず、形状や安全上の注意はこの品番の説明書で確認してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH fit 5kg",
    "modelNumber": "ITW-50B01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576795661",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112861.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112861.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/news/2025/?date=1015",
    "lookupNote": "2025年発売のOSH fitです。色・容量別の公式説明書52〜60ページを確認しています。糸くずフィルターは洗濯のたびに清掃し、本体外側・洗剤投入ケース・柔軟剤投入口は汚れたら清掃してください。これらは固定の日数に置き換えていません。部品の清掃時は運転を停止して電源プラグを抜きます。槽乾燥では黒かびや洗剤かすは除去できません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112861.pdf#page=58",
        "conditions": "説明書58〜59ページ。衣類を入れず、槽クリーンコースを使用します。クリーナーの投入は説明書の給水・一時停止の手順に従い、使用量はクリーナーの表示を確認してください。塩素系漂白剤を酸性のものや液体と混ぜないでください。終了後は糸くずフィルターを清掃し、水栓を閉じます。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112861.pdf#page=60",
        "conditions": "説明書60ページ。洗濯物を入れず、電源を入れて槽クリーンを選び、洗いを0分・すすぎを0回に設定してスタートします。約30分で終了します。黒かびや洗剤かすがある場合は槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH fit 5kg",
    "modelNumber": "ITW-50B01-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576795678",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112862.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112862.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/news/2025/?date=1015",
    "lookupNote": "2025年発売のOSH fitです。色・容量別の公式説明書52〜60ページを確認しています。糸くずフィルターは洗濯のたびに清掃し、本体外側・洗剤投入ケース・柔軟剤投入口は汚れたら清掃してください。これらは固定の日数に置き換えていません。部品の清掃時は運転を停止して電源プラグを抜きます。槽乾燥では黒かびや洗剤かすは除去できません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112862.pdf#page=58",
        "conditions": "説明書58〜59ページ。衣類を入れず、槽クリーンコースを使用します。クリーナーの投入は説明書の給水・一時停止の手順に従い、使用量はクリーナーの表示を確認してください。塩素系漂白剤を酸性のものや液体と混ぜないでください。終了後は糸くずフィルターを清掃し、水栓を閉じます。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112862.pdf#page=60",
        "conditions": "説明書60ページ。洗濯物を入れず、電源を入れて槽クリーンを選び、洗いを0分・すすぎを0回に設定してスタートします。約30分で終了します。黒かびや洗剤かすがある場合は槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH fit 6kg",
    "modelNumber": "ITW-60B01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576795685",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112863.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112863.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/news/2025/?date=1015",
    "lookupNote": "2025年発売のOSH fitです。色・容量別の公式説明書52〜60ページを確認しています。糸くずフィルターは洗濯のたびに清掃し、本体外側・洗剤投入ケース・柔軟剤投入口は汚れたら清掃してください。これらは固定の日数に置き換えていません。部品の清掃時は運転を停止して電源プラグを抜きます。槽乾燥では黒かびや洗剤かすは除去できません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112863.pdf#page=58",
        "conditions": "説明書58〜59ページ。衣類を入れず、槽クリーンコースを使用します。クリーナーの投入は説明書の給水・一時停止の手順に従い、使用量はクリーナーの表示を確認してください。塩素系漂白剤を酸性のものや液体と混ぜないでください。終了後は糸くずフィルターを清掃し、水栓を閉じます。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112863.pdf#page=60",
        "conditions": "説明書60ページ。洗濯物を入れず、電源を入れて槽クリーンを選び、洗いを0分・すすぎを0回に設定してスタートします。約30分で終了します。黒かびや洗剤かすがある場合は槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH fit 6kg",
    "modelNumber": "ITW-60B01-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576795692",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112864.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112864.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/news/2025/?date=1015",
    "lookupNote": "2025年発売のOSH fitです。色・容量別の公式説明書52〜60ページを確認しています。糸くずフィルターは洗濯のたびに清掃し、本体外側・洗剤投入ケース・柔軟剤投入口は汚れたら清掃してください。これらは固定の日数に置き換えていません。部品の清掃時は運転を停止して電源プラグを抜きます。槽乾燥では黒かびや洗剤かすは除去できません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112864.pdf#page=58",
        "conditions": "説明書58〜59ページ。衣類を入れず、槽クリーンコースを使用します。クリーナーの投入は説明書の給水・一時停止の手順に従い、使用量はクリーナーの表示を確認してください。塩素系漂白剤を酸性のものや液体と混ぜないでください。終了後は糸くずフィルターを清掃し、水栓を閉じます。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "1週間に1回程度（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112864.pdf#page=60",
        "conditions": "説明書60ページ。洗濯物を入れず、電源を入れて槽クリーンを選び、洗いを0分・すすぎを0回に設定してスタートします。約30分で終了します。黒かびや洗剤かすがある場合は槽洗浄を行ってください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 8kg 4連タンク",
    "modelNumber": "TCW-80A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576667708",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104373.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104373.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年11月発売のOSH 8kg（4連タンク）。糸くずフィルターは洗濯のたびに水洗いし、本体外側・自動投入タンク取り付け部・洗剤投入ケースは汚れたら清掃します。部品のお手入れは運転を停止して行い、タンク取り付け部の接続部を強くこすらないでください。槽乾燥は説明書75ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使い、黒かびや洗剤かすは槽洗浄で除去します。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。ふろ水ホースも汚れたらストレーナー・フィルターを外して水洗いし、ホース内に水道水を流して洗います。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104373.pdf#page=74",
        "conditions": "説明書74ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度・洗剤変更時など（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104373.pdf#page=76",
        "conditions": "説明書76ページ。洗剤・柔軟剤の変更時、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外し、中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤2と柔軟剤1を同時に3秒以上押し、洗浄するタンクを選んでスタートします。終了後はタンクの水を捨ててセットし、液剤を補充した後、説明書33ページの充填操作で洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 8kg 2連タンク",
    "modelNumber": "ITW-80A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576672092",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104612.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104612.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年11月発売のOSH 8kg（2連タンク）。糸くずフィルターは洗濯のたびに水洗いし、本体外側・自動投入タンク取り付け部・洗剤投入ケースは汚れたら清掃します。部品のお手入れは運転を停止して行い、タンク取り付け部の接続部を強くこすらないでください。槽乾燥は説明書69ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使い、黒かびや洗剤かすは槽洗浄で除去します。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104612.pdf#page=68",
        "conditions": "説明書68ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度・洗剤変更時など（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104612.pdf#page=70",
        "conditions": "説明書70ページ。洗剤・柔軟剤の変更時、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外し、中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートします。終了後はタンクの水を捨ててセットし、液剤を補充した後、説明書32ページの充填操作で洗濯機内部にも液剤を充填してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 8kg（自動投入なし）",
    "modelNumber": "ITW-80A02-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576668392",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104379.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104379.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年11月発売のOSH 8kg（自動投入なし）。専用説明書55〜60ページを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。槽乾燥は説明書60ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使います。黒かびや洗剤かすは槽乾燥では取り除けないので槽洗浄を行ってください。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104379.pdf#page=59",
        "conditions": "説明書59ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 10kg 4連タンク",
    "modelNumber": "TCW-100A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576667715",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104374.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104374.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売のOSH 10kg（4連タンク）。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。ふろ水ホースは汚れたらストレーナー・フィルターを外して水洗いし、ホース内に水道水を流して洗います。部品のお手入れは運転を停止して行います。槽乾燥は説明書80ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使います。黒かびや洗剤かすは槽洗浄で除去します。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104374.pdf#page=79",
        "conditions": "説明書79ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度・洗剤変更時など（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104374.pdf#page=81",
        "conditions": "説明書81ページ。洗剤・柔軟剤の変更時、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外し、中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤2と柔軟剤1を同時に3秒以上押し、洗浄するタンクを選んでスタートします。終了後はタンクの水を捨ててセットし、液剤を補充します。説明書30〜31ページの充填操作でタンクを1つずつ選び、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 10kg 2連タンク",
    "modelNumber": "ITW-100A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576672108",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104613.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104613.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売のOSH 10kg（2連タンク）。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。ふろ水ホースは汚れたらストレーナー・フィルターを外して水洗いし、ホース内に水道水を流して洗います。部品のお手入れは運転を停止して行います。槽乾燥は説明書80ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使います。黒かびや洗剤かすは槽洗浄で除去します。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104613.pdf#page=79",
        "conditions": "説明書79ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "frequency": "3か月に1回程度・洗剤変更時など（予定計算は90日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104613.pdf#page=81",
        "conditions": "説明書81ページ。洗剤・柔軟剤の変更時、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外し、中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートします。終了後はタンクの水を捨ててセットし、液剤を補充します。説明書30〜31ページの充填操作でタンクを1つずつ選び、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動洗濯機 OSH 10kg（自動投入なし）",
    "modelNumber": "ITW-100A02-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576668415",
    "productLinkLabel": "公式商品サポート",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104381.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104381.pdf",
    "manualLinkLabel": "取扱説明書（PDF）",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売のOSH 10kg（自動投入なし）。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。ふろ水ホースは汚れたらストレーナー・フィルターを外して水洗いし、ホース内に水道水を流して洗います。部品のお手入れは運転を停止して行います。槽乾燥は説明書69ページの「定期的に」という案内で、日数指定はありません。衣類を入れず槽乾燥コースを使います。黒かびや洗剤かすは槽洗浄で除去します。毎回・汚れ時・定期的な清掃に固定の日数は設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "1か月に1回程度（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104381.pdf#page=68",
        "conditions": "説明書68ページ。衣類を入れず、電源を入れて槽洗浄コースを選び、ふたを閉めてスタートします。給水終了後に一時停止してふたを開け、市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-A1053H-W",
    "modelNumber": "ITW-A1053H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576845311",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115287.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115287.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115287.pdf#page=80",
        "frequency": "1か月に1回程度",
        "conditions": "説明書80ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選びます。必要に応じて脱水時間を設定します。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115287.pdf#page=81",
        "frequency": "1週間に1回程度",
        "conditions": "説明書81ページ。衣類を入れず、電源を入れ、「槽クリーン」コースを選び、洗いとすすぎをそれぞれ0に設定してスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115287.pdf#page=82",
        "frequency": "3か月に1回程度",
        "conditions": "説明書82〜83ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクふたを外して内側とふたを水洗いし、ふたを元に戻します。タンクに40℃以下のぬるま湯を満杯まで入れてセットし、電源を入れ、洗剤と柔軟剤を同時に3秒以上押します。洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨てて水分をしっかり切り、セットして液剤を補充します。補充は説明書27〜29ページ、銘柄を変えた場合の基準量設定は30ページを確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-F853H-W",
    "modelNumber": "ITW-F853H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576845304",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115286.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115286.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115286.pdf#page=79",
        "frequency": "1か月に1回程度",
        "conditions": "説明書79ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選びます。必要に応じて脱水時間を設定します。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115286.pdf#page=80",
        "frequency": "1週間に1回程度",
        "conditions": "説明書80ページ。衣類を入れず、電源を入れ、「槽クリーン」コースを選び、洗いとすすぎをそれぞれ0に設定してスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115286.pdf#page=81",
        "frequency": "3か月に1回程度",
        "conditions": "説明書81〜82ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクふたを外して内側とふたを水洗いし、ふたを元に戻します。タンクに40℃以下のぬるま湯を満杯まで入れてセットし、電源を入れ、洗剤と柔軟剤を同時に3秒以上押します。洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨てて水分をしっかり切り、セットして液剤を補充します。補充は説明書27〜29ページ、銘柄を変えた場合の基準量設定は30ページを確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-F1003H-W",
    "modelNumber": "ITW-F1003H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576845298",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115285.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115285.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115285.pdf#page=72",
        "frequency": "1か月に1回程度",
        "conditions": "説明書72ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115285.pdf#page=73",
        "frequency": "1週間に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れ、「槽乾燥」コースを選んでスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115285.pdf#page=74",
        "frequency": "3か月に1回程度",
        "conditions": "説明書74〜75ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクふたを外して内側とふたを水洗いし、ふたを元に戻します。タンクに40℃以下のぬるま湯を満杯まで入れてセットし、電源を入れ、洗剤と柔軟剤を同時に3秒以上押します。洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨てて水分をしっかり切り、セットして液剤を補充します。補充は説明書27〜29ページ、銘柄を変えた場合の基準量設定は30ページを確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-F803H-W",
    "modelNumber": "ITW-F803H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576845281",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115284.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115284.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115284.pdf#page=73",
        "frequency": "1か月に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115284.pdf#page=74",
        "frequency": "1週間に1回程度",
        "conditions": "説明書74ページ。衣類を入れず、電源を入れ、「槽乾燥」コースを選んでスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/115284.pdf#page=75",
        "frequency": "3か月に1回程度",
        "conditions": "説明書75〜76ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクふたを外して内側とふたを水洗いし、ふたを元に戻します。タンクに40℃以下のぬるま湯を満杯まで入れてセットし、電源を入れ、洗剤と柔軟剤を同時に3秒以上押します。洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨てて水分をしっかり切り、セットして液剤を補充します。補充は説明書27〜29ページ、銘柄を変えた場合の基準量設定は30ページを確認してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-H1003H-W",
    "modelNumber": "ITW-H1003H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576817509",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113757.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113757.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書65ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113757.pdf#page=64",
        "frequency": "1か月に1回程度",
        "conditions": "説明書64ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-H803H-W",
    "modelNumber": "ITW-H803H-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576817493",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113756.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113756.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70",
    "lookupNote": "2026年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いします。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書65ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/113756.pdf#page=64",
        "frequency": "1か月に1回程度",
        "conditions": "説明書64ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-70B01-W",
    "modelNumber": "ITW-70B01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576769419",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/110550.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/110550.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。自動投入タンクも汚れ時に外して水洗いし、水分をしっかり切ります。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/110550.pdf#page=73",
        "frequency": "1か月に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/110550.pdf#page=74",
        "frequency": "1週間に1回程度",
        "conditions": "説明書74ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選び、洗いとすすぎをそれぞれ0に設定してスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/110550.pdf#page=75",
        "frequency": "3か月に1回程度",
        "conditions": "説明書75ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、水分をしっかり切り、セットして液剤を補充します。説明書29〜30ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-85A01-W",
    "modelNumber": "ITW-85A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576775502",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111127.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111127.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111127.pdf#page=78",
        "frequency": "1か月に1回程度",
        "conditions": "説明書78ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111127.pdf#page=79",
        "frequency": "1週間に1回程度",
        "conditions": "説明書79ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選び、洗いとすすぎをそれぞれ0に設定してスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111127.pdf#page=80",
        "frequency": "3か月に1回程度",
        "conditions": "説明書80ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、セットして液剤を補充します。説明書31〜32ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 TCW-105A02-W",
    "modelNumber": "TCW-105A02-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576775519",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111137.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111137.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。ふろ水ホースは汚れたらストレーナー・フィルターを外して水洗いし、ホース内に水道水を流して洗ってください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111137.pdf#page=83",
        "frequency": "1か月に1回程度",
        "conditions": "説明書83ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111137.pdf#page=84",
        "frequency": "1週間に1回程度",
        "conditions": "説明書84ページ。衣類を入れず、電源を入れて「槽クリーン」コースを選び、洗いとすすぎをそれぞれ0に設定してスタートします。黒かびや洗剤かすは槽乾燥では取り除けません。槽洗浄を行ってください。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/111137.pdf#page=85",
        "frequency": "3か月に1回程度",
        "conditions": "説明書85ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、セットして液剤を補充します。説明書31〜32ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 TCW-80A02-W",
    "modelNumber": "TCW-80A02-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576785709",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112105.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112105.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書74ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112105.pdf#page=73",
        "frequency": "1か月に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112105.pdf#page=75",
        "frequency": "3か月に1回程度",
        "conditions": "説明書75ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤2と柔軟剤1を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、セットして液剤を補充します。説明書29〜30ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-100A03-W",
    "modelNumber": "ITW-100A03-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576785723",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112107.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112107.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書74ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112107.pdf#page=73",
        "frequency": "1か月に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112107.pdf#page=75",
        "frequency": "3か月に1回程度",
        "conditions": "説明書75ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、セットして液剤を補充します。説明書29〜30ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-100A04-W",
    "modelNumber": "ITW-100A04-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576785730",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112108.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112108.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書63ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112108.pdf#page=62",
        "frequency": "1か月に1回程度",
        "conditions": "説明書62ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 TCW-100A02-W",
    "modelNumber": "TCW-100A02-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576785716",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112106.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112106.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを取り除き、水洗いしてください。本体外側は汚れたらよくしぼったやわらかい布で拭き、洗剤投入ケースは汚れたら外して水洗いし、注水口の汚れも拭き取ります。部品の清掃は運転を停止して行ってください。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書74ページの「定期的に」という案内で、日数指定はありません。衣類を入れず「槽乾燥」コースを使ってください。黒かびや洗剤かすは槽洗浄で除去します。自動投入タンク取り付け部は汚れたら拭き、接続部を強くこすらないでください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112106.pdf#page=73",
        "frequency": "1か月に1回程度",
        "conditions": "説明書73ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開してください。終了後は糸くずフィルターを清掃します。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/112106.pdf#page=75",
        "frequency": "3か月に1回程度",
        "conditions": "説明書75ページ。液体洗剤・柔軟剤を変えるとき、1か月以上未使用、ふたを開けて放置したとき、液剤がゼリー状になるなど変質したときにも洗浄します。衣類を入れず、停止した状態でタンクを外して中を水ですすぎ、40℃以下のぬるま湯を満杯まで入れてセットします。電源を入れ、洗剤2と柔軟剤1を同時に3秒以上押し、洗浄するタンクを選んでスタートしてください。終了後はタンクの水を捨て、セットして液剤を補充します。説明書29〜30ページの充填操作で、電源を入れ、どのボタンも押していない状態で水量と洗いを同時に3秒以上押します。充填するタンクを1つ選んでスタートし、洗濯機内部にも液剤を充填してください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-70A01-BH",
    "modelNumber": "ITW-70A01-BH",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576743532",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109002.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109002.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときや液剤が流れにくいときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109002.pdf#page=51",
        "frequency": "1か月に1回程度",
        "conditions": "説明書51ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。槽洗浄の水量は55Lに固定されています。におい・汚れ・洗剤かすが気になるときにも槽洗浄を行ってください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109002.pdf#page=53",
        "frequency": "1週間に1回程度",
        "conditions": "説明書53ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-70A01-WH",
    "modelNumber": "ITW-70A01-WH",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576743525",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109001.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109001.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときや液剤が流れにくいときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109001.pdf#page=51",
        "frequency": "1か月に1回程度",
        "conditions": "説明書51ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。槽洗浄の水量は55Lに固定されています。におい・汚れ・洗剤かすが気になるときにも槽洗浄を行ってください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/109001.pdf#page=53",
        "frequency": "1週間に1回程度",
        "conditions": "説明書53ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 IAW-T606-B",
    "modelNumber": "IAW-T606-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576743167",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108964.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108964.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=2",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。漂白剤注入口も汚れたら拭きます。洗剤投入ケースは汚れたら外してキャップも水洗いし、注水口を拭いて元どおり取り付けます。柔軟剤投入口は不要な歯ブラシなどで汚れを落としてください。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108964.pdf#page=54",
        "frequency": "1か月に1回程度",
        "conditions": "説明書54ページ。衣類を入れず、水栓を開け、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。終了後は給水栓を閉じます。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108964.pdf#page=56",
        "frequency": "1週間に1回程度",
        "conditions": "説明書56ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 IAW-T606-W",
    "modelNumber": "IAW-T606-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576743150",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108963.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108963.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2025年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。漂白剤注入口も汚れたら拭きます。洗剤投入ケースは汚れたら外してキャップも水洗いし、注水口を拭いて元どおり取り付けます。柔軟剤投入口は不要な歯ブラシなどで汚れを落としてください。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108963.pdf#page=54",
        "frequency": "1か月に1回程度",
        "conditions": "説明書54ページ。衣類を入れず、水栓を開け、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。終了後は給水栓を閉じます。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/108963.pdf#page=56",
        "frequency": "1週間に1回程度",
        "conditions": "説明書56ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-100B01-W",
    "modelNumber": "ITW-100B01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576706254",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107306.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107306.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書57ページで「定期的に」と案内され、日数指定はありません。衣類を入れず「槽乾燥」コースを使います。黒かびや洗剤かすは槽洗浄で除去してください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107306.pdf#page=56",
        "frequency": "1か月に1回程度",
        "conditions": "説明書56ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-80B01-B",
    "modelNumber": "ITW-80B01-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576709606",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107416.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107416.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書57ページで「定期的に」と案内され、日数指定はありません。衣類を入れず「槽乾燥」コースを使います。黒かびや洗剤かすは槽洗浄で除去してください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107416.pdf#page=56",
        "frequency": "1か月に1回程度",
        "conditions": "説明書56ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-80B01-W",
    "modelNumber": "ITW-80B01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576706247",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107305.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107305.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。槽乾燥は説明書57ページで「定期的に」と案内され、日数指定はありません。衣類を入れず「槽乾燥」コースを使います。黒かびや洗剤かすは槽洗浄で除去してください。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107305.pdf#page=56",
        "frequency": "1か月に1回程度",
        "conditions": "説明書56ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-60A01-W",
    "modelNumber": "ITW-60A01-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576704809",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107219.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107219.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2024年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときや液剤が流れにくいときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107219.pdf#page=51",
        "frequency": "1か月に1回程度",
        "conditions": "説明書51ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。におい・汚れ・洗剤かすが気になるときにも槽洗浄を行ってください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/107219.pdf#page=53",
        "frequency": "1週間に1回程度",
        "conditions": "説明書53ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 ITW-70A01",
    "modelNumber": "ITW-70A01",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576670913",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104573.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104573.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2023年発売。専用説明書のお手入れを確認しています。糸くずフィルターは洗濯のたびに取り外し、カバーを開けて糸くずを取り除き、水洗いして元どおり取り付けます。本体外側は汚れたらよくしぼったやわらかい布で拭いてください。洗剤投入ケースは汚れたときや液剤が流れにくいときに外して水洗いし、注水口の汚れも拭き取ります。部品のお手入れは運転を停止して行います。毎回・汚れ時のお手入れには固定の日数を設定していません。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104573.pdf#page=51",
        "frequency": "1か月に1回程度",
        "conditions": "説明書51ページ。衣類を入れず、電源を入れて「槽洗浄」コースを選びます。ふたを閉めてスタートし、給水終了後に一時停止してふたを開けます。市販の塩素系漂白剤・槽洗浄用クリーナーを表示の分量で投入し、ふたを閉めて再開します。終了後は糸くずフィルターを清掃してください。槽洗浄の水量は55Lに固定されています。におい・汚れ・洗剤かすが気になるときにも槽洗浄を行ってください。塩素系漂白剤を酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。本体外側などに付いたら速やかに拭き取り、換気してください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/104573.pdf#page=53",
        "frequency": "1週間に1回程度",
        "conditions": "説明書53ページ。衣類を入れず、電源を入れて「槽乾燥」コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため、槽洗浄を行ってください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "アイリスオーヤマ",
    "name": "ドラム式洗濯乾燥機 HDK852Z-W",
    "modelNumber": "HDK852Z-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576679909",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105081.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105081.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=3",
    "lookupNote": "2023年発売。専用説明書のお手入れを確認しています。乾燥フィルターは乾燥運転後に毎回清掃します。内部フィルターは乾燥運転30回ごとの表示を目安に清掃し、30日ごとには設定していません。メッシュのほこりをしぼったタオルなどで取り、目詰まり時は水洗いします。強くこすらず、フィルターを確実に戻してください。洗剤投入ケースは汚れたら外して水洗いし、柔軟剤キャップを戻します。本体・ドア・ドアパッキンは汚れたら40℃以下の水を含ませてしぼった布で拭き、パッキンのひだの奥の糸くずや髪も取り除きます。部品清掃は運転を停止して行い、毎回・表示時・汚れ時の作業に固定日数は付けません。槽クリーンの乾燥のみは日数指定がないため定期候補には追加していません。",
    "suggestions": [
      {
        "name": "ドラムの槽クリーン",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105081.pdf#page=110",
        "frequency": "月に1回程度",
        "conditions": "説明書110〜112ページ。衣類を入れず、給水栓を開けて電源を入れます。洗濯または洗濯乾燥を選び、槽クリーンコースに設定してください。塩素系漂白剤・槽洗浄用クリーナーを使うときは、初期設定の60℃から必ず洗い温度を30℃以下に変更し、表示の分量を直接ドラムに入れます。40℃・60℃や乾燥のみの運転には入れないでください。酸素系・台所用漂白剤は使用せず、酸性のものや他の液体と混ぜないでください。ドアを閉めてスタートし、終了してドアロックが解除されたら給水栓を閉じます。ゴム手袋を着け、水抜きホースで排水して糸くずフィルターを清掃します。におい・汚れ・洗剤かすが気になるときにも行ってください。"
      },
      {
        "name": "糸くずフィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105081.pdf#page=104",
        "frequency": "週に1回程度",
        "conditions": "説明書104〜105ページ。脱水のみで運転し、終了後は電源を切ります。フィルターカバーを開け、水抜きホースのキャップを外して容器に排水してから、フィルターのつまみを左に回して引き抜きます。ドラムに水があるときや運転中には開けないでください。残水を布で受け、ごみを除いて水洗いし、ゴムパッキンを正しい位置に戻します。フィルターをまっすぐ差し込み、右に回して確実に固定し、水抜きホースにキャップをして戻し、カバーを閉じます。"
      },
      {
        "name": "自動投入タンク・経路の洗浄",
        "kind": "掃除",
        "intervalDays": 90,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105081.pdf#page=99",
        "frequency": "3か月に1回程度",
        "conditions": "説明書99〜101ページ。液剤の変更、1か月以上未使用、ふたを開けたまま放置、液剤の変質時にも行います。運転を停止し、自動投入部ふたを開け、タンクを手前に引いてから真上に外します。タンクのふたも外し、液剤を捨てて水洗いし、ふたとタンクを確実に取り付けます。40℃以下のぬるま湯を洗剤タンク約850mL・柔軟剤タンク約600mL入れます。電源を入れ、洗剤と柔軟剤を同時に3秒以上押し、洗浄するタンクのボタンを選んでスタートします。約7分の運転後、タンクのぬるま湯を捨て、水分を拭き取り、タンクを取り付けて自動投入部ふたを閉じます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "ドラム式洗濯乾燥機 CDK852-W",
    "modelNumber": "CDK852-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576679886",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105079.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105079.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年発売。専用説明書のお手入れを確認しています。乾燥フィルターは乾燥運転後に毎回清掃します。内部フィルターは乾燥運転30回ごとの表示を目安に清掃し、30日ごとには設定していません。メッシュのほこりをしぼったタオルなどで取り、目詰まり時は水洗いします。強くこすらず、フィルターを確実に戻してください。洗剤投入ケースは汚れたら外して水洗いし、柔軟剤キャップを戻します。本体・ドア・ドアパッキンは汚れたら40℃以下の水を含ませてしぼった布で拭き、パッキンのひだの奥の糸くずや髪も取り除きます。部品清掃は運転を停止して行い、毎回・表示時・汚れ時の作業に固定日数は付けません。槽クリーンの乾燥のみは日数指定がないため定期候補には追加していません。",
    "suggestions": [
      {
        "name": "ドラムの槽クリーン",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105079.pdf#page=101",
        "frequency": "月に1回程度",
        "conditions": "説明書101〜103ページ。衣類を入れず、給水栓を開けて電源を入れます。洗濯または洗濯乾燥を選び、槽クリーンコースに設定してください。塩素系漂白剤・槽洗浄用クリーナーを使うときは、初期設定の60℃から必ず洗い温度を30℃以下に変更し、表示の分量を直接ドラムに入れます。40℃・60℃や乾燥のみの運転には入れないでください。酸素系・台所用漂白剤は使用せず、酸性のものや他の液体と混ぜないでください。ドアを閉めてスタートし、終了してドアロックが解除されたら給水栓を閉じます。ゴム手袋を着け、水抜きホースで排水して糸くずフィルターを清掃します。におい・汚れ・洗剤かすが気になるときにも行ってください。"
      },
      {
        "name": "糸くずフィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105079.pdf#page=95",
        "frequency": "週に1回程度",
        "conditions": "説明書95〜96ページ。脱水のみで運転し、終了後は電源を切ります。フィルターカバーを開け、水抜きホースのキャップを外して容器に排水してから、フィルターのつまみを左に回して引き抜きます。ドラムに水があるときや運転中には開けないでください。残水を布で受け、ごみを除いて水洗いし、ゴムパッキンを正しい位置に戻します。フィルターをまっすぐ差し込み、右に回して確実に固定し、水抜きホースにキャップをして戻し、カバーを閉じます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "ドラム式洗濯乾燥機 FLK852-B",
    "modelNumber": "FLK852-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576679923",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105083.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105083.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年発売。専用説明書のお手入れを確認しています。乾燥フィルターは乾燥運転後に毎回清掃します。内部フィルターは乾燥運転30回ごとの表示を目安に清掃し、30日ごとには設定していません。メッシュのほこりをしぼったタオルなどで取り、目詰まり時は水洗いします。強くこすらず、フィルターを確実に戻してください。洗剤投入ケースは汚れたら外して水洗いし、柔軟剤キャップを戻します。本体・ドア・ドアパッキンは汚れたら40℃以下の水を含ませてしぼった布で拭き、パッキンのひだの奥の糸くずや髪も取り除きます。部品清掃は運転を停止して行い、毎回・表示時・汚れ時の作業に固定日数は付けません。槽クリーンの乾燥のみは日数指定がないため定期候補には追加していません。",
    "suggestions": [
      {
        "name": "ドラムの槽クリーン",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105083.pdf#page=101",
        "frequency": "月に1回程度",
        "conditions": "説明書101〜103ページ。衣類を入れず、給水栓を開けて電源を入れます。洗濯または洗濯乾燥を選び、槽クリーンコースに設定してください。塩素系漂白剤・槽洗浄用クリーナーを使うときは、初期設定の60℃から必ず洗い温度を30℃以下に変更し、表示の分量を直接ドラムに入れます。40℃・60℃や乾燥のみの運転には入れないでください。酸素系・台所用漂白剤は使用せず、酸性のものや他の液体と混ぜないでください。ドアを閉めてスタートし、終了してドアロックが解除されたら給水栓を閉じます。ゴム手袋を着け、水抜きホースで排水して糸くずフィルターを清掃します。におい・汚れ・洗剤かすが気になるときにも行ってください。"
      },
      {
        "name": "糸くずフィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105083.pdf#page=95",
        "frequency": "週に1回程度",
        "conditions": "説明書95〜96ページ。脱水のみで運転し、終了後は電源を切ります。フィルターカバーを開け、水抜きホースのキャップを外して容器に排水してから、フィルターのつまみを左に回して引き抜きます。ドラムに水があるときや運転中には開けないでください。残水を布で受け、ごみを除いて水洗いし、ゴムパッキンを正しい位置に戻します。フィルターをまっすぐ差し込み、右に回して確実に固定し、水抜きホースにキャップをして戻し、カバーを閉じます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "ドラム式洗濯乾燥機 FLK852-W",
    "modelNumber": "FLK852-W",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576679893",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105080.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105080.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年発売。専用説明書のお手入れを確認しています。乾燥フィルターは乾燥運転後に毎回清掃します。内部フィルターは乾燥運転30回ごとの表示を目安に清掃し、30日ごとには設定していません。メッシュのほこりをしぼったタオルなどで取り、目詰まり時は水洗いします。強くこすらず、フィルターを確実に戻してください。洗剤投入ケースは汚れたら外して水洗いし、柔軟剤キャップを戻します。本体・ドア・ドアパッキンは汚れたら40℃以下の水を含ませてしぼった布で拭き、パッキンのひだの奥の糸くずや髪も取り除きます。部品清掃は運転を停止して行い、毎回・表示時・汚れ時の作業に固定日数は付けません。槽クリーンの乾燥のみは日数指定がないため定期候補には追加していません。",
    "suggestions": [
      {
        "name": "ドラムの槽クリーン",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105080.pdf#page=101",
        "frequency": "月に1回程度",
        "conditions": "説明書101〜103ページ。衣類を入れず、給水栓を開けて電源を入れます。洗濯または洗濯乾燥を選び、槽クリーンコースに設定してください。塩素系漂白剤・槽洗浄用クリーナーを使うときは、初期設定の60℃から必ず洗い温度を30℃以下に変更し、表示の分量を直接ドラムに入れます。40℃・60℃や乾燥のみの運転には入れないでください。酸素系・台所用漂白剤は使用せず、酸性のものや他の液体と混ぜないでください。ドアを閉めてスタートし、終了してドアロックが解除されたら給水栓を閉じます。ゴム手袋を着け、水抜きホースで排水して糸くずフィルターを清掃します。におい・汚れ・洗剤かすが気になるときにも行ってください。"
      },
      {
        "name": "糸くずフィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105080.pdf#page=95",
        "frequency": "週に1回程度",
        "conditions": "説明書95〜96ページ。脱水のみで運転し、終了後は電源を切ります。フィルターカバーを開け、水抜きホースのキャップを外して容器に排水してから、フィルターのつまみを左に回して引き抜きます。ドラムに水があるときや運転中には開けないでください。残水を布で受け、ごみを除いて水洗いし、ゴムパッキンを正しい位置に戻します。フィルターをまっすぐ差し込み、右に回して確実に固定し、水抜きホースにキャップをして戻し、カバーを閉じます。"
      }
    ]
  },
  {
    "maker": "アイリスオーヤマ",
    "name": "全自動電気洗濯機 IAW-T504-B",
    "modelNumber": "IAW-T504-B",
    "categoryId": "washer",
    "productUrl": "https://www.irisohyama.co.jp/products/support/4967576681940",
    "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105601.pdf",
    "discoveredManualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105601.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2023,
    "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/70?page=4",
    "lookupNote": "2023年12月発売。糸くずフィルターは洗濯のたびにカバーを開けて糸くずを除き、水洗いして元どおり取り付けます。本体外側・漂白剤注入口は汚れたらしぼったやわらかい布で拭きます。洗剤投入ケースは汚れたら外して水洗いし、注水口を拭き、柔軟剤投入口は不要な歯ブラシなどで清掃します。部品清掃は運転を停止して行い、毎回・汚れ時には固定日数を付けません。槽乾燥は見出しが定期的ですが、詳細58ページに週1回程度と明記されています。",
    "suggestions": [
      {
        "name": "洗濯・脱水槽の槽洗浄",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105601.pdf#page=56",
        "frequency": "1か月に1回程度",
        "conditions": "説明書56〜57ページ。衣類を入れず、水栓を開けて電源を入れ、槽洗浄を選びます。ふたを閉めて給水開始し、給水終了後に一時停止してふたを開け、塩素系漂白剤・槽洗浄用クリーナーを表示の分量で入れます。ふたを閉めて再開し、終了後に糸くずフィルターを清掃して給水栓を閉じます。酸性のものや他の液体と混ぜず、空の槽に直接付着させないでください。"
      },
      {
        "name": "洗濯・脱水槽の槽乾燥",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/105601.pdf#page=58",
        "frequency": "1週間に1回程度",
        "conditions": "説明書58ページ。衣類を入れず、電源を入れて槽乾燥コースを選び、スタートします。約30分で終了します。黒かびや洗剤かすは槽乾燥では取り除けないため槽洗浄を行ってください。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push({
  "maker": "アイリスオーヤマ",
  "name": "充電式サイクロンスティッククリーナー SCD-123P-HC",
  "modelNumber": "SCD-123P-HC",
  "categoryId": "vacuum",
  "productUrl": "https://www.irisohyama.co.jp/products/support/4967576692571",
  "productLinkLabel": "公式製品・説明書一覧",
  "manualUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf",
  "manualLinkLabel": "取扱説明書",
  "releaseYear": 2024,
  "releaseSourceUrl": "https://www.irisohyama.co.jp/products/manual/13?page=5",
  "verifiedAt": "2026-10-10",
  "lookupNote": "公式一覧で2024年2月発売。SCD-123P-HCに直接案内される専用説明書の清掃手順を確認しています。清掃後も吸引力が弱い場合のフィルター交換は使用状況によるため、固定交換年数は設定していません。",
  "suggestions": [
    {
      "name": "本体・延長パイプ・ヘッド外側・付属品の拭き掃除",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。よく絞った柔らかい布で本体・延長パイプ・フロアヘッド外側・充電スタンド・すき間ノズル・静電モップハンドルなどを拭きます。"
    },
    {
      "name": "ほこり感知センサーのお手入れ",
      "kind": "掃除",
      "intervalDays": 7,
      "frequency": "1週間に1回程度（予定計算は7日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=38",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。割りばしに布などを巻き、内部のほこり感知センサーを拭きます。"
    },
    {
      "name": "ダストカップ・フィルターのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=39",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カップ底の取り外しボタンを押してロックを外し、手前に引きます。ボタンを押さずに無理に外しません。サイクロンユニット・排気・スポンジフィルターを外します。ユニット上を反時計回りに回して上下に分解します。ユニットのメッシュフィルターはクリーニングブラシで手入れします。ユニット・ケース・スポンジはごみを軽くはたき落として水洗いします。排気はごみを落とし、クリーニングブラシを谷に沿って動かして水洗いし、強く押し付けてこすりません。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かし、ドライヤーなどの熱風を当てません。ユニット上を下にはめ込み、時計回りに回して組み立てます。スポンジをユニット中央のくぼみに入れ、排気を取り付け、凸部と切り欠きを合わせてケースに戻します。カップ上側の穴に本体のつめを差し込み、カチッと鳴るまで押し込みます。続きは40〜41ページを確認してください。"
    },
    {
      "name": "本体風路・延長パイプの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。本体風路・延長パイプ内部を定期的に点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "フロアヘッドの詰まり点検",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=42",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。フロアヘッド内部と吸い込み口を点検し、詰まったごみをピンセットや割りばしなどで取り除きます。"
    },
    {
      "name": "回転ブラシのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=43",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。カバーのつめを押し下げて手前に引き、カバーを外します。回転ブラシを持ち上げて外します。絡まったごみはブラシの溝に沿ってはさみで切り、水洗いします。よく水を切り、風通しのよい場所に約24時間置いて十分に乾かします。ブラシを戻し、カバーのつめをフロアヘッド前端内側に引っかけ、カチッと音がするまで押し込みます。再取り付けは44ページを確認してください。"
    },
    {
      "name": "静電モップ・モップ帯電ケースのお手入れ",
      "kind": "掃除",
      "intervalDays": 30,
      "frequency": "1か月に1回程度（予定計算は30日）",
      "sourceKind": "取扱説明書",
      "sourceUrl": "https://www.irisohyama.co.jp/products/manual/pdf/299979.pdf#page=44",
      "conditions": "必ず運転を停止し、本体を充電スタンドから外して行います。本体・充電スタンド・充電アダプターには水をかけません。洗剤・シンナー・ベンジン・漂白剤・化学ぞうきんは使いません。ハンドル先端のボタンを押しながらモップ部を引き抜き、水洗いしてしっかり水を切り、よく乾かします。ケースも水洗いし、よく水を切り、よく乾かします。"
    }
  ]
} satisfies ProductCandidate);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバ コンボ 2 Essential + AutoEmpty 充電ステーション（ホワイト）",
    "modelNumber": "Y051260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://www.irobot-jp.com/roombacombo/2essentialrobot/index.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualLinkLabel": "取扱説明書",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20240829_01.pdf",
    "lookupNote": "2024年9月20日発売。専用説明書17〜22ページで本体と充電ステーションの周期を確認。水タンクは清掃後毎回空にし、モップは拭き掃除後に冷たい水で手洗いして自然乾燥します。ダスト容器は必要に応じて空にし、水洗いしません。紙パックはLEDランプやiRobot Homeアプリのお知らせで交換し、最大60日分の収納能力を交換周期として扱いません。交換目安はフィルター・エッジブラシ・モップ3〜6か月、メインブラシ6〜12か月で、使用状況や損耗によって変わるため固定日数にはしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "週1回（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "停止してお手入れします。ダスト容器のフタを開いてフィルターを外し、お手入れツールでごみを取り除いて戻します。水ですすぐ場合は完全に乾かしてから取り付けます。頻繁なすすぎは推奨されません。ダスト容器はすすいだり水に浸したりしません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=19",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "停止してお手入れします。ブラシフレーム取り外しレバーを押してフレームを外し、お手入れツールでブラシの髪の毛やごみを取り除き、ブラシとフレームを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=19",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。ブラシを取り外し、お手入れツールで髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。お手入れツールで前輪の髪の毛やごみを取り除きます。お手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。乾いた清潔な布で拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "停止してお手入れします。乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=21",
        "frequency": "月1回（予定計算は30日）",
        "conditions": "停止してお手入れします。異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションのブロワーカバーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=22",
        "frequency": "月1回（予定計算は30日）",
        "conditions": "停止してお手入れします。糸くずやごみが絡んでいないか点検し、乾いた清潔な布で付着物を取り除きます。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ コンボ 2 Essential + AutoEmpty 充電ステーション（ブラック）",
    "modelNumber": "Y051060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://www.irobot-jp.com/roombacombo/2essentialrobot/index.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualLinkLabel": "取扱説明書",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2024,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20240829_01.pdf",
    "lookupNote": "2024年9月20日発売。専用説明書17〜22ページで本体と充電ステーションの周期を確認。水タンクは清掃後毎回空にし、モップは拭き掃除後に冷たい水で手洗いして自然乾燥します。ダスト容器は必要に応じて空にし、水洗いしません。紙パックはLEDランプやiRobot Homeアプリのお知らせで交換し、最大60日分の収納能力を交換周期として扱いません。交換目安はフィルター・エッジブラシ・モップ3〜6か月、メインブラシ6〜12か月で、使用状況や損耗によって変わるため固定日数にはしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "週1回（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "停止してお手入れします。ダスト容器のフタを開いてフィルターを外し、お手入れツールでごみを取り除いて戻します。水ですすぐ場合は完全に乾かしてから取り付けます。頻繁なすすぎは推奨されません。ダスト容器はすすいだり水に浸したりしません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=19",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "停止してお手入れします。ブラシフレーム取り外しレバーを押してフレームを外し、お手入れツールでブラシの髪の毛やごみを取り除き、ブラシとフレームを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=19",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。ブラシを取り外し、お手入れツールで髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。お手入れツールで前輪の髪の毛やごみを取り除きます。お手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "停止してお手入れします。乾いた清潔な布で拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=18",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "停止してお手入れします。乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=21",
        "frequency": "月1回（予定計算は30日）",
        "conditions": "停止してお手入れします。異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションのブロワーカバーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/guide/OGCombo2EssentialAutoEmptyJP.pdf#page=22",
        "frequency": "月1回（予定計算は30日）",
        "conditions": "停止してお手入れします。糸くずやごみが絡んでいないか点検し、乾いた清潔な布で付着物を取り除きます。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバ Plus 405 Combo + AutoWash 充電ステーション",
    "modelNumber": "G185060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/G185060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_3.pdf",
    "lookupNote": "2025年4月18日発売。専用説明書14〜23ページを確認。ダスト容器は必要に応じてフィルターを外して水・ぬるま湯ですすぎ、完全に乾かして戻します。食洗機は使えません。モップは水拭き後に自動清掃され、180時間ごとの洗浄指定を180日には置き換えていません。給水・廃水タンクは必要に応じてすすぎ、廃水を空にし、給水を補充してラッチを閉じて戻します。タンクも食洗機不可。傾斜路は目に見える汚れがあれば清掃し、充電ステーションのフィルターもごみを点検して乾いた布で除去します。紙パックはLEDやRoomba Homeアプリの通知で交換します。最大75日分の収納能力は交換周期ではありません。交換目安のフィルター・エッジブラシ3〜6か月、メインブラシ6〜12か月は使用状況によるため固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=16",
        "conditions": "上部カバーを持ち上げ、取り外しボタンでダスト容器を外し、フィルターを取り外します。お手入れツールでフィルターの汚れを取り除き、戻します。フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=15",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除き、ブラシとカバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=14",
        "conditions": "ブラシを引っ張って外し、お手入れツールで髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=18",
        "conditions": "お手入れツールで前輪の髪の毛やごみを取り除きます。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=18",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=18",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=21",
        "conditions": "異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "パッド洗浄容器・液体オーバーフロー容器の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安に、目に見える汚れがあれば（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=19",
        "conditions": "パッド洗浄容器を乾いた清潔な布で拭き、排水ポートのごみや障害物を確認します。頑固な汚れには中性洗剤とスポンジを使えます。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Plus400/OG400SeriesPLUSCombowAWAPACJAjaJP.pdf#page=14",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ Plus 505 Combo + AutoWash 充電ステーション",
    "modelNumber": "N185060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/N185060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_3.pdf",
    "lookupNote": "2025年4月18日発売。専用説明書14〜23ページを確認。ダスト容器は必要に応じてフィルターを外して水・ぬるま湯ですすぎ、完全に乾かして戻します。食洗機は使えません。モップは水拭き後に自動清掃され、180時間ごとの洗浄指定を180日には置き換えていません。給水・廃水タンクは必要に応じてすすぎ、廃水を空にし、給水を補充してラッチを閉じて戻します。タンクも食洗機不可。傾斜路は目に見える汚れがあれば清掃し、充電ステーションのフィルターもごみを点検して乾いた布で除去します。紙パックはLEDやRoomba Homeアプリの通知で交換します。最大75日分の収納能力は交換周期ではありません。交換目安のフィルター・エッジブラシ3〜6か月、メインブラシ6〜12か月は使用状況によるため固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=16",
        "conditions": "上部カバーを持ち上げ、取り外しボタンでダスト容器を外し、フィルターを取り外します。お手入れツールでフィルターの汚れを取り除き、戻します。フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=15",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除き、ブラシとカバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=14",
        "conditions": "ブラシを引っ張って外し、お手入れツールで髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=18",
        "conditions": "お手入れツールで前輪の髪の毛やごみを取り除きます。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=18",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサー・カメラウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=18",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=21",
        "conditions": "異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "パッド洗浄容器・液体オーバーフロー容器の清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安に、目に見える汚れがあれば（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=19",
        "conditions": "パッド洗浄容器を乾いた清潔な布で拭き、排水ポートのごみや障害物を確認します。頑固な汚れには中性洗剤とスポンジを使えます。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG505PLUSCombowAWjaJP.pdf#page=14",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバ105 Combo（ホワイト）",
    "modelNumber": "Y311260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/Y311260.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。105単体専用説明書12〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。ダスト容器は必要に応じて空にし、お手入れツールと清潔な布で清掃します。ダスト容器はすすぎ・水に浸すことが禁止されています。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=15",
        "conditions": "ダスト容器とフィルターを外し、お手入れツールでフィルターのごみを除去します。容器を清潔な布で拭いて戻します。ダスト容器はすすいだり水に浸したりしません。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=13",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=12",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=17",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=12",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ105 Combo（ブラック）",
    "modelNumber": "Y311060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/Y311060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。105単体専用説明書12〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。ダスト容器は必要に応じて空にし、お手入れツールと清潔な布で清掃します。ダスト容器はすすぎ・水に浸すことが禁止されています。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=15",
        "conditions": "ダスト容器とフィルターを外し、お手入れツールでフィルターのごみを除去します。容器を清潔な布で拭いて戻します。ダスト容器はすすいだり水に浸したりしません。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=13",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=12",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=14",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=17",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwCOjaJP.pdf#page=12",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ105 Combo + AutoEmpty 充電ステーション（ホワイト）",
    "modelNumber": "Y351260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/Y351260.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。AutoEmpty付き専用説明書11〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。ダスト容器は必要に応じて空にし、お手入れツールと清潔な布で清掃します。ダスト容器はすすぎ・水に浸すことが禁止されています。紙パックは充電ステーションのLEDやRoomba Homeアプリで満杯のお知らせを受けたら交換します。最大75日分の収納能力は交換周期ではありません。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=14",
        "conditions": "ダスト容器とフィルターを外し、お手入れツールでフィルターのごみを除去します。容器を清潔な布で拭いて戻します。ダスト容器はすすいだり水に浸したりしません。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=12",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=11",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=15",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "AutoEmpty充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=17",
        "conditions": "電源コードを抜き、底面のブロワーカバーに糸くずやごみが絡んでいないか点検し、乾いた清潔な布で拭いて除去します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=11",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ105 Combo + AutoEmpty 充電ステーション（ブラック）",
    "modelNumber": "Y351060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/Y351060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。AutoEmpty付き専用説明書11〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。ダスト容器は必要に応じて空にし、お手入れツールと清潔な布で清掃します。ダスト容器はすすぎ・水に浸すことが禁止されています。紙パックは充電ステーションのLEDやRoomba Homeアプリで満杯のお知らせを受けたら交換します。最大75日分の収納能力は交換周期ではありません。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=14",
        "conditions": "ダスト容器とフィルターを外し、お手入れツールでフィルターのごみを除去します。容器を清潔な布で拭いて戻します。ダスト容器はすすいだり水に浸したりしません。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=12",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。お手入れツールで髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=11",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=13",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=15",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "AutoEmpty充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=17",
        "conditions": "電源コードを抜き、底面のブロワーカバーに糸くずやごみが絡んでいないか点検し、乾いた清潔な布で拭いて除去します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG105ComboandVacwAEjaJP.pdf#page=11",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ205 DustCompactor Combo（ホワイト）",
    "modelNumber": "L121260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/L121260.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。205専用説明書11〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。DustCompactorダスト容器は必要に応じて空にし、清潔な布で拭きます。フィルター清掃後はラッチと全側面を隙間なく閉じます。最大60日分の収納能力はごみ捨ての固定周期ではありません。水タンク洗浄は説明書10ページのすすぎ・洗剤禁止と16ページのすすぎ・食器用洗剤の案内が異なるため、方法はメーカーへ確認してください。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=14",
        "conditions": "DustCompactorダスト容器をまっすぐにして、ごみ箱の上で取り外しタブを押し、ごみを捨てます。フィルターを外してごみ箱の上ではたき、容器は清潔な布で拭きます。フィルターを戻し、ラッチと全側面を隙間なく閉じて取り付け直します。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=12",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=11",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "前輪部を引き上げて外し、前輪部とくぼみの髪の毛やごみを除去して戻します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーやセンサーのウィンドウに洗剤や水を吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=17",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=11",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバ205 DustCompactor Combo（ブラック）",
    "modelNumber": "L121060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/L121060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_2.pdf",
    "lookupNote": "2025年4月18日発売。205専用説明書11〜17ページを確認。水タンクは清掃後に毎回空にし、モップパッドは拭き掃除後に毎回冷たい水で手洗いして自然乾燥させます。毎回の作業は固定日数にしていません。DustCompactorダスト容器は必要に応じて空にし、清潔な布で拭きます。フィルター清掃後はラッチと全側面を隙間なく閉じます。最大60日分の収納能力はごみ捨ての固定周期ではありません。水タンク洗浄は説明書10ページのすすぎ・洗剤禁止と16ページのすすぎ・食器用洗剤の案内が異なるため、方法はメーカーへ確認してください。フィルター・エッジブラシ・モップパッドの交換目安3〜6か月、メインブラシ6〜12か月は使用状況によるため、固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=14",
        "conditions": "DustCompactorダスト容器をまっすぐにして、ごみ箱の上で取り外しタブを押し、ごみを捨てます。フィルターを外してごみ箱の上ではたき、容器は清潔な布で拭きます。フィルターを戻し、ラッチと全側面を隙間なく閉じて取り付け直します。 フィルターの水洗い手順はこの説明書では案内されていません。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "frequency": "週1回を目安（予定計算は7日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=12",
        "conditions": "ブラシカバー取り外しレバーを押し、カバーとブラシを外します。髪の毛やごみを取り除きます。ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=11",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを取り除いて取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "前輪部を引き上げて外し、前輪部とくぼみの髪の毛やごみを除去して戻します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで接続部を拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=13",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーやセンサーのウィンドウに洗剤や水を吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "frequency": "月1回を目安（予定計算は30日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=17",
        "conditions": "部品に異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/OG205ComboandVacjaJP.pdf#page=11",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバMax 705 Vac + AutoEmpty 充電ステーション",
    "modelNumber": "W155060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/W155060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250416_4.pdf",
    "lookupNote": "2025年4月18日発売。Max 705 Vac専用説明書10〜17ページを確認。吸引専用モデルです。ダスト容器は必要に応じて空にし、吸引口のごみも除去します。洗浄時は必ずフィルターを外し、容器をぬるま湯で洗って完全に乾かして戻します。食洗機は使えず、フィルターは洗わないでください。エッジブラシ3〜6か月・デュアルブラシ6〜12か月の交換目安は使用状況によるため固定日数にしていません。紙パックはステーションのLEDやRoomba Homeアプリで満杯のお知らせが出たら交換します。最大75日分の収納能力は交換周期ではありません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=14",
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "ダスト容器とフィルターを外し、お手入れツールでごみを除去します。ダスト容器を空にして清潔な布で拭き、フィルターと容器を戻します。フィルターは洗わないでください。"
      },
      {
        "name": "ゴム製デュアルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=11",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "取り外しレバーをつまんで持ち上げ、異物を除去します。2本のブラシと端のキャップを外し、キャップ内側の髪の毛やごみを取り除きます。キャップを戻し、ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=10",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=12",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=12",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=12",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=15",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=17",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "電源コードを抜き、底面のブロワーカバーに糸くずやごみがないか点検し、乾いた清潔な布で拭いて除去します。"
      },
      {
        "name": "フィルターの交換",
        "kind": "交換",
        "intervalDays": 60,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=10",
        "frequency": "2か月ごとの交換目安（予定計算は60日）",
        "conditions": "使用状況によって交換時期は異なります。摩耗が目で見て分かる場合は予定日前でも交換してください。清掃の週1回とは別の目安です。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/705MAXVacAutoEmptyOGJP.pdf#page=10",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMax 705 Combo + AutoWash 充電ステーション",
    "modelNumber": "X185060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/X185060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2025,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20250827.pdf",
    "lookupNote": "2025年8月29日発売。Max 700 Combo専用説明書16〜31ページを確認。フィルタースクリーンは洗浄後に完全に乾かし、フィルター本体の水洗いとは区別します。ダスト容器は必要に応じてフィルターを外し、水またはぬるま湯ですすぎ、完全に乾いてから戻します。ロボットの廃水用タンクと内部チューブは必要に応じて清掃し、黒いゴム栓を戻して本体裏側の残留物も除去します。PowerSpinローラーモップは必要に応じて、緑のボタンからエッジクリップ・ローラー・スクレーパーを外し、髪の毛や残留物を除去します。ゴム製ストリップは矢印側だけを剥がし、すすいで拭き、水平に押し戻します。カバーが閉じている場合は無理に開きません。スクレーパーとローラーを戻し、カチッと収まることを確認します。ステーションの給水・廃水タンクは必要に応じてすすぎ、給水を補充・廃水を空にしてラッチを閉じて戻します。洗剤用タンクも必要時に洗浄します。ダスト容器・廃水用タンク・ステーション水タンクは食洗機不可。フィルター・エッジブラシは3〜6か月、デュアルブラシ・ローラーモップは6〜12か月が交換目安で、範囲を固定周期にはしていません。紙パックはステーションのLEDやRoomba Homeアプリで満杯のお知らせが出たら交換します。最大75日分の収納能力は交換周期ではありません。必要時の作業や最大8週間のモップ洗浄性能を固定日数の予定にはしていません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=24",
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "上部カバーとダスト容器を外し、フィルターとフィルタースクリーンを外します。お手入れツールでごみを除去します。スクリーンは洗えますが、完全に乾かして戻します。フィルター本体の水洗い手順は案内されていません。"
      },
      {
        "name": "ゴム製デュアルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=17",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "取り外しレバーをつまんで持ち上げ、異物を除去します。2本のブラシと端のキャップを外し、キャップ内側の髪の毛やごみを取り除きます。キャップを戻し、ブラシとカバーを取り付け直します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=16",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを除去して取り付け直します。2本とも清掃します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 28,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=18",
        "frequency": "4週間に1回を目安（ペットがいる家庭では週1回。予定計算は28日）",
        "conditions": "お手入れツールで前輪の髪の毛やごみを除去します。説明書の図に従い、マイナスドライバーで車輪を引き出してキャスターから外します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "後輪の清掃",
        "kind": "掃除",
        "intervalDays": 28,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=19",
        "frequency": "4週間に1回を目安（ペットがいる家庭では週1回。予定計算は28日）",
        "conditions": "黒い後輪部を右から左へ優しく引いて持ち上げ、金属の棒とともに開きます。車輪をスライドさせて外し、お手入れツールで毛やごみを除去します。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=19",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=19",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=26",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーに洗剤や水を吹き付けません。"
      },
      {
        "name": "AutoWash洗浄容器・エアダクトの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=27",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "磁石で取り付けられたダクトカバーを持ち上げ、ダクトとモップ洗浄容器の下や周囲のごみを乾いた清潔な布で丁寧に拭き取ります。排水ポートの詰まりを確認します。頑固な汚れには中性洗剤とスポンジを使えます。後方の空気吹き出し口へごみを押し込まず、カバーを戻します。"
      },
      {
        "name": "充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "電源コードを抜き、底面のブロワーカバーに糸くずやごみがないか点検し、乾いた清潔な布で拭いて除去します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2025/OGs/NewSeries/Max700C/OG700SeriesMAXCombowAWAmericasjaJP.pdf#page=16",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバMini + AutoEmpty 充電ステーション（白）",
    "modelNumber": "F155260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F155260.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年2月27日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。AutoEmptyの紙パックは満杯の通知や赤色LEDが出たら交換し、カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで蓋を閉めます。最大3か月分のごみ収納能力は交換周期ではありません。ステーションフィルターのブロワーカバーは必要に応じて糸くずやごみを点検し、乾いた清潔な布で拭きます。固定周期の指定はありません。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMini + AutoEmpty 充電ステーション（黒）",
    "modelNumber": "F155060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F155060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年2月27日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。AutoEmptyの紙パックは満杯の通知や赤色LEDが出たら交換し、カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで蓋を閉めます。最大3か月分のごみ収納能力は交換周期ではありません。ステーションフィルターのブロワーカバーは必要に応じて糸くずやごみを点検し、乾いた清潔な布で拭きます。固定周期の指定はありません。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMini + AutoEmpty 充電ステーション（桜）",
    "modelNumber": "F155660",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F155660.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年3月13日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。AutoEmptyの紙パックは満杯の通知や赤色LEDが出たら交換し、カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで蓋を閉めます。最大3か月分のごみ収納能力は交換周期ではありません。ステーションフィルターのブロワーカバーは必要に応じて糸くずやごみを点検し、乾いた清潔な布で拭きます。固定周期の指定はありません。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMini + AutoEmpty 充電ステーション（若葉）",
    "modelNumber": "F155460",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F155460.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年3月13日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。AutoEmptyの紙パックは満杯の通知や赤色LEDが出たら交換し、カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで蓋を閉めます。最大3か月分のごみ収納能力は交換周期ではありません。ステーションフィルターのブロワーカバーは必要に応じて糸くずやごみを点検し、乾いた清潔な布で拭きます。固定周期の指定はありません。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMini Slim + SlimCharge 充電スタンド（白）",
    "modelNumber": "F115260",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F115260.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年4月6日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。SlimCharge充電スタンドのみで、自動ごみ収集や紙パックはありません。縦置き収納中はスケジュール清掃が機能しないため、予約清掃時は平置きにします。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMini Slim + SlimCharge 充電スタンド（黒）",
    "modelNumber": "F115060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/F115060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260219.pdf",
    "lookupNote": "2026年4月6日発売。Mini/Mini Slim共通説明書20〜34ページを確認。使い捨て床拭きシートは毎回の清掃後に廃棄し、パッドプレートは使用後毎回、冷たい水で手洗いして自然乾燥します。使用後の作業を固定日数の予定にはしていません。給水タンクの手入れはありません。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外してすすぎ、完全に乾かして戻します。フィルター・エッジブラシ3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。SlimCharge充電スタンドのみで、自動ごみ収集や紙パックはありません。縦置き収納中はスケジュール清掃が機能しないため、予約清掃時は平置きにします。",
    "suggestions": [
      {
        "name": "ダスト容器を空にして清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=27",
        "frequency": "少なくとも週1回（予定計算は7日）",
        "conditions": "上部カバーを持ち上げ、取り外しボタンを押して容器を外します。ゴミ箱の上で開き、空にして布で清掃して戻します。必要に応じて洗う場合は必ずフィルターを外し、水またはぬるま湯ですすぎ、完全に乾かしてから戻します。食洗機は使いません。"
      },
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=28",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "ダスト容器からフィルターを外し、ゴミ箱の上ではたいてごみを落とし、お手入れツールや清潔な布で清掃して戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシカバーの取り外しレバーをつまんで持ち上げ、異物を除去します。ブラシを外し、髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "お手入れツールを使って前輪から髪の毛やごみを除去します。手入れ後も動きが悪い場合はサービスセンターへ相談してください。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=25",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=31",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/Mini/OGRoombaMinijaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバPlus 515 Combo + AutoWash 充電ステーション",
    "modelNumber": "N285060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/N285060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260527_01.pdf",
    "lookupNote": "2026年5月29日発売。Plus 510〜519専用説明書20〜38ページを確認。フィルターは水洗い禁止です。ダスト容器は必要に応じてフィルターを外して空にし、布で拭くか水またはぬるま湯ですすぎます。食洗機は使えません。パッドプレートは使用後毎回、モップパッドは水拭き後に自動洗浄・乾燥されます。本体の水タンクは使用後に空にするとの記載がありますが、取り外しや排水の具体的な手順は記載されていないためメーカーへ確認してください。ステーションの給水・廃水タンクは必要に応じて外してラッチを開け、廃水を空にし、水またはぬるま湯ですすぎます。頑固な汚れには中性洗剤とスポンジを使えます。給水を補充し、廃水タンクを空のまま、蓋を確実にロックして戻します。水タンクは食洗機不可。紙パックは満杯の通知が出たら交換し、収納部ドアを外し、カードを引き出して密封し、新しいカードをガイドレールに沿って挿入してドアを戻します。最大3か月のごみ収納能力は交換周期ではありません。フィルター・エッジブラシ・モップパッド3〜6か月、シングルアクションブラシ6〜12か月の交換目安は範囲を固定日数にしていません。",
    "suggestions": [
      {
        "name": "フィルターカートリッジの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=27",
        "frequency": "週1回（ペットがいる家庭は週2回。予定計算は7日）",
        "conditions": "上部カバーとダスト容器を外し、フィルターカートリッジとそのカバーを外します。ゴミ箱の上ではたき、清潔な布で清掃します。カートリッジのカバーとハウジングを容器に戻して、本体のカバーを戻します。フィルターは洗わないでください。"
      },
      {
        "name": "シングルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=21",
        "frequency": "週1回（予定計算は7日）",
        "conditions": "ブラシフレーム取り外しレバーを押し、フレームを持ち上げて外します。ブラシを外して髪の毛やごみを除去します。端のキャップも外して内側を清掃し、キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=20",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを取り外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "車輪を持ち上げて本体から外し、布で前輪部の下の髪の毛やごみを除去します。マイナスドライバーで車輪を引き出し、キャスターから外します。戻す際は手のひらでカチッと音がするまで押し込みます。手入れ後も動きが悪い場合はサービスセンターへ相談します。"
      },
      {
        "name": "本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=26",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "充電ステーションから本体を取り外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=26",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電台の接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=32",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電台のプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "AutoWash洗浄容器・ゴミガード・エアダクトの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=38",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "説明書32ページに洗浄容器とエアダクトの頻度が示されています。38ページの手順でゴミガードを外して水容器を拭き、ごみをすすぐか拭きます。ゴミガードを戻し、正しく収まって上向きになっていることを確認します。エアダクトの分解洗浄手順は記載されていません。"
      },
      {
        "name": "充電ステーションフィルターの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=38",
        "frequency": "毎月（予定計算は30日）",
        "conditions": "収納部ドアを外し、ブロワーカバーに糸くずやごみが絡みついていないか点検し、乾いた清潔な布で拭いて取り除きます。収納部ドアを戻します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/515/OG515jaJP.pdf#page=20",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷がある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

catalog.push(...[
  {
    "maker": "iRobot",
    "name": "ルンバMax 715 Vac + AutoEmpty 充電ステーション",
    "modelNumber": "W255060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/W255060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260717.pdf",
    "lookupNote": "2026年7月17日発売。Max 710〜719 Vac専用説明書14〜27ページを図表で確認。吸引専用モデルで、水拭きの手入れはありません。ダスト容器は必要に応じてフィルターを外して空にし、布で拭くか水またはぬるま湯ですすぎます。吸引口にたまったごみも除去します。フィルターは水洗い禁止、ダスト容器は食洗機不可。フィルター・エッジブラシは3〜6か月、デュアルブラシは6〜12か月が交換目安で、範囲を固定日数にはしていません。紙パックはステーションのLEDやRoomba Homeアプリで満杯のお知らせが出たら交換します。カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで蓋を戻します。最大90日分のごみ収納能力は交換周期ではありません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=20",
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "取り外しボタンを押してダスト容器を外し、フィルターカートリッジを外します。ゴミ箱の上ではたき、清潔な布で清掃します。容器を空にし、布で拭いてフィルターハウジングを戻し、本体に取り付けます。フィルターは洗わないでください。"
      },
      {
        "name": "ゴム製デュアルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=15",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "ブラシフレーム取り外しレバーを押し、フレームを持ち上げて外します。2本のブラシと端のキャップを外して、髪の毛やごみ、キャップ内部のごみを除去します。キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=14",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを除去して取り付け直します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=18",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "前輪部から髪の毛やごみを取り除きます。戻す際は手のひらでカチッと音がするまで押し込みます。手入れ後も動きが悪い場合はサービスセンターへ相談します。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=19",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=19",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤などを吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=24",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電ステーションのプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=27",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "電源コードを抜き、底面のブロワーカバーに糸くずやごみがないか点検し、乾いた清潔な布で拭いて除去します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/715/715VOGJPUpdated.pdf#page=14",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  },
  {
    "maker": "iRobot",
    "name": "ルンバMax 775 Combo + AutoWash 充電ステーション",
    "modelNumber": "X285060",
    "categoryId": "robot-vacuum",
    "productUrl": "https://store.irobot-jp.com/item/X285060.html",
    "productLinkLabel": "メーカー公式製品情報",
    "manualUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf",
    "manualLinkLabel": "取扱説明書",
    "verifiedAt": "2026-10-10",
    "releaseYear": 2026,
    "releaseSourceUrl": "https://www.irobot-jp.com/press/pdf/20260717.pdf",
    "lookupNote": "2026年7月17日発売。Max 770〜779専用説明書23〜53ページを確認。フィルタースクリーンは洗浄後に完全に乾かしますが、フィルター本体は水洗い禁止です。前輪・後輪の清掃は2週間ごとです。ダスト容器は必要に応じてフィルターを外して空にし、水またはぬるま湯ですすいだ後、完全に乾かして戻します。食洗機は使えません。ロボットの廃水用容器は必要に応じて取り外しボタンで外して開き、内側の黒いゴム栓を外して内部チューブを清掃し、栓を戻します。容器をすすいで残留物を拭き、本体裏側の残留物も除去して容器を戻します。廃水用容器は食洗機不可。PowerSpinローラーモップは必要に応じて緑のボタンをスライドしてエッジクリップとローラーを引き出し、スクレーパーを外して毛やごみを除去します。ゴム製ストリップは矢印側だけを剥がし、反対側は付けたまま、上下をすすぎ拭き取ります。矢印側から戻して水平に押し下げます。カバーが閉じている場合は無理に開きません。アクチュエータも清掃し、スクレーパーとローラーを戻してカチッと収まることを確認します。ステーションの給水・廃水タンクは必要に応じて外してラッチを開け、廃水を空にし、水またはぬるま湯ですすぎます。頑固な汚れには中性洗剤とスポンジを使えます。給水をMAXまで補充し、廃水タンクは空のまま、蓋を確実にロックして戻します。水タンクは食洗機不可。説明書の使用後の水タンク排水と必要時の作業は、固定日数の予定にはしていません。フィルター・エッジブラシは3〜6か月、デュアルブラシ・ローラーモップは6〜12か月が交換目安で、範囲を固定日数にはしていません。紙パックはステーションのLEDやRoomba Homeアプリで満杯のお知らせが出たら交換します。カードを引き上げて密封して外し、新しいカードをガイドレールに沿って差し込んで収納部ドアを戻します。最大90日分のごみ収納能力は交換周期ではありません。",
    "suggestions": [
      {
        "name": "フィルターの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=40",
        "frequency": "週1回を目安（ペットがいる家庭では週2回。予定計算は7日）",
        "conditions": "上部カバーとダスト容器を外し、フタを開けてフィルターカートリッジとスクリーンを取り外します。カートリッジはゴミ箱の上ではたき、清潔な布で清掃します。スクリーンは洗えますが、完全に乾かしてから戻します。フィルター本体は洗わないでください。フィルターを取り付けてフタを閉じ、カチッと収まることを確認し、容器と上部カバーを戻します。"
      },
      {
        "name": "ゴム製デュアルアクションブラシの清掃",
        "kind": "掃除",
        "intervalDays": 7,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=24",
        "frequency": "週1回を目安（予定計算は7日）",
        "conditions": "ブラシフレーム取り外しレバーをつまんで持ち上げ、異物を除去します。2本のブラシと端のキャップを外して、髪の毛やごみ、キャップ内部のごみを除去します。キャップ・ブラシ・カバーを戻します。"
      },
      {
        "name": "エッジクリーニングブラシの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=24",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ブラシを引っ張って外し、髪の毛やごみを除去して取り付け直します。2本とも清掃します。"
      },
      {
        "name": "前輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=27",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "車輪を持ち上げて本体から外し、下の毛やごみを布で除去します。マイナスドライバーで車輪を引き出してキャスターから外します。戻す際は手のひらでカチッと音がするまで押し込みます。手入れ後も動きが悪い場合はサービスセンターへ相談します。"
      },
      {
        "name": "後輪の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=28",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "黒い後輪部を右から左へ優しく引いて持ち上げ、金属の棒とともに開きます。車輪をスライドさせて外し、お手入れツールで毛やごみを除去します。"
      },
      {
        "name": "ロボット本体の充電用接続部の清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=29",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "ロボットを充電ステーションから外し、清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。"
      },
      {
        "name": "ロボット本体のセンサーの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=29",
        "frequency": "月1回、または必要に応じて（予定計算は30日）",
        "conditions": "清潔な乾いた布、または軽く湿らせたメラミンフォームで拭きます。センサーに洗剤や水を吹き付けません。"
      },
      {
        "name": "充電ステーションの接続部・センサー・IRウィンドウの清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=46",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "充電ステーションのプラグを抜き、異物やごみがないか点検し、乾いた清潔な布で拭きます。センサーや接続部に洗剤や水を吹き付けないでください。"
      },
      {
        "name": "AutoWash洗浄容器・エアダクトの清掃",
        "kind": "掃除",
        "intervalDays": 14,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=52",
        "frequency": "2週間に1回、または必要に応じて（予定計算は14日）",
        "conditions": "磁石で取り付けられたダクトカバーを持ち上げ、ダクトとモップ洗浄容器の下や周囲のごみを乾いた清潔な布で丁寧に拭き取ります。排水ポートの詰まりを確認します。頑固な汚れには中性洗剤とスポンジを使えます。後方の空気吹き出し口へごみを押し込まず、カバーを戻します。"
      },
      {
        "name": "充電ステーションのフィルター清掃",
        "kind": "掃除",
        "intervalDays": 30,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=52",
        "frequency": "月1回を目安（予定計算は30日）",
        "conditions": "収納部ドアを外し、ブロワーカバーに糸くずやごみが絡みついていないか点検し、乾いた清潔な布で拭いて除去します。収納部ドアを戻します。"
      },
      {
        "name": "ブラシカバーの点検",
        "kind": "掃除",
        "intervalDays": 180,
        "sourceKind": "取扱説明書",
        "sourceUrl": "https://prod-help-content.care.irobotapi.com/files/2026/OwnersGuides/775/OG770jaJP.pdf#page=23",
        "frequency": "6か月ごとに点検（予定計算は180日）",
        "conditions": "摩耗や損傷を点検し、ある場合は交換します。6か月ごとの指定は点検であり、一律の交換周期ではありません。"
      }
    ]
  }
] satisfies ProductCandidate[]);

export const supportedModels = catalog.map(candidate => candidate.modelNumber);
