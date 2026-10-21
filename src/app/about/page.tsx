import Link from "next/link";
import { CALCULATION_VERSION, RECOVERY } from "@/core/params";

export const metadata = { title: "计算说明 · AI Fitness Garden" };

const H = ({ children }: { children: React.ReactNode }) => <h2 className="text-lg font-semibold mt-6 mb-2">{children}</h2>;

export default function About() {
  return (
    <article className="pt-safe pb-8 text-[15px] leading-relaxed">
      <Link href="/me" className="text-accent text-sm inline-block mt-4">
        ‹ 返回
      </Link>
      <h1 className="text-2xl font-bold mt-2">这些数字是怎么算的</h1>
      <p className="text-sm text-muted mt-1">计算版本 {CALCULATION_VERSION}。标注「估计」的是产品规则，不是经过验证的生理常数。</p>

      <H>1. 有效组数（训练量）</H>
      <ul className="list-disc pl-5 space-y-1">
        <li>只统计你打勾确认的组；热身组不计，递减组每段按 0.5 组（估计）。</li>
        <li>主要肌群按 1 组，辅助肌群约 0.5 组，稳定肌约 0.25 组。0.5 的「分数组」做法来自训练量 meta 分析（Pelland/Remmert 等，2024）对肌肥大的拟合；具体系数是估计。</li>
        <li>RIR 0–3 视为完整刺激；RIR 4 约 0.75、5 约 0.5、更高约 0.25（估计）。没填 RIR 时按正式组计算，但会标注可信度较低。</li>
        <li>双侧动作 3 组 = 左右各 3 组，汇总时取两侧平均，仍是 3 组，不会变成 6 组。单侧动作左右各自统计，不会自动补齐。</li>
        <li>「向左/向右旋转」只表示方向，系统只记录核心整体负荷，不制造单侧腹斜肌数据。</li>
        <li>辅助引体等「辅助重量」越大越轻松，不会当成普通负重；不同器械的重量也不互相比较。</li>
      </ul>

      <H>2. 恢复估计</H>
      <ul className="list-disc pl-5 space-y-1">
        <li>每次训练给相关肌群留下一份「残余疲劳」= 有效组数 × 力竭程度系数（RIR≤1 更高，估计）。</li>
        <li>残余疲劳随时间指数衰减（基础时间常数约 {RECOVERY.tauHours} 小时，大肌群略长、小肌群略短，估计）；多次训练累加，不会互相覆盖。</li>
        <li>残余降到阈值以下 = 「预计可训练」。约 4 个有效组 ≈ 48 小时，8 组 ≈ 60 小时，2 组 ≈ 36 小时——不是固定 48 小时。</li>
        <li>练到力竭会让神经肌肉恢复变慢（Morán-Navarro 等 2017：力竭组比非力竭组的恢复多需要约 24–48 小时），所以力竭组的系数更高。</li>
        <li>当天的精神、睡眠和你报告的酸痛会延长估计；长期反馈会在 0.8–1.4 倍范围内调整你的个人恢复系数。</li>
        <li>「需要关注」：报告了疼痛或明显酸痛、单次/一周训练量较高、连续多天高负荷、连续几天自评疲劳。</li>
        <li>肌肉酸痛不等于训练效果，恢复估计也不是医学诊断。显示「恢复中」时你仍然可以训练，系统只会提示。</li>
      </ul>

      <H>3. 训练建议</H>
      <ul className="list-disc pl-5 space-y-1">
        <li>每周每个部位的目标组数：重点部位从适应期 6–9 组逐步到 10–14 组（初级）。依据：每周约 10 组以上的肌肥大效果更好（Schoenfeld 等 2017），但边际收益递减；初学者从较低训练量开始（ACSM 2009：每个动作 1–3 组、每周 2–3 天）。</li>
        <li>频率：重点部位每周尽量安排 2 次。</li>
        <li>今天推荐哪些部位 = 预计已恢复 × 本周还差多少组 × 你设定的优先级。暂不优先的部位不会被推荐。</li>
        <li>动作只从当前健身房登记的器械里选；没有某个器械时可以「替换」，按主要肌群相似度、动作模式、难度和近期疲劳排序。</li>
        <li>重量：双重渐进。所有正式组都达到次数上限且仍有余力才建议加重；没有 RIR 时要连续两次达到才加；没有历史记录时不编造重量，而是告诉你如何找到起始重量。</li>
        <li>建议只是建议。你实际练了什么就记录什么，没做的推荐不会算进训练，下一次建议按实际记录重新计算。</li>
      </ul>

      <H>4. 肌肉农场</H>
      <p>植物的生长只代表「预计训练准备度」的时间进度，不代表肌纤维修复。多练不会长得更快：再次训练会重新播种。成就奖励规律训练、在成熟后再训练和稳定进步，而不是训练量或连续打卡。</p>

      <H>参考</H>
      <ul className="list-disc pl-5 space-y-1 text-sm text-muted">
        <li>ACSM (2009). Progression models in resistance training for healthy adults. Med Sci Sports Exerc 41(3).</li>
        <li>Schoenfeld BJ, Ogborn D, Krieger JW (2017). Dose-response relationship between weekly resistance training volume and increases in muscle mass. J Sports Sci.</li>
        <li>Schoenfeld BJ, Ogborn D, Krieger JW (2016). Effects of resistance training frequency on measures of muscle hypertrophy. Sports Med.</li>
        <li>Pelland JC et al. (2024). The resistance training dose-response: meta-regressions exploring the effects of weekly volume and frequency (preprint, SportRxiv).</li>
        <li>Remmert JF et al. Is there too much of a good thing? Meta-regressions of per-session volume (preprint, SportRxiv).</li>
        <li>Robinson ZP et al. (2024). Exploring the dose–response relationship between estimated resistance training proximity to failure, strength gain, and muscle hypertrophy. Sports Med 54:2209–2231.</li>
        <li>Morán-Navarro R et al. (2017). Time course of recovery following resistance training leading or not to failure. Eur J Appl Physiol 117:2387–2399.</li>
      </ul>
    </article>
  );
}
