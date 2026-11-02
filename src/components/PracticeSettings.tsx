export function PracticeSettings({ strictBlankOrder, ready, change }: { strictBlankOrder: boolean; ready: boolean; change(value: boolean): void }) {
  return <section><h3>答题规则</h3><div className="practice-setting">
    <label htmlFor="strict-blank-order"><strong>填空严格模式</strong><span id="strict-blank-order-description">按文档顺序判题，单个空内及多个空之间的顿号、“和”等并列答案均不能换序。关闭后允许并列换序。</span></label>
    <input id="strict-blank-order" type="checkbox" role="switch" className="setting-switch" aria-label="填空严格模式" aria-describedby="strict-blank-order-description" checked={strictBlankOrder} disabled={!ready} onChange={event => change(event.target.checked)} />
  </div><p className="muted setting-note">默认开启，自动保存。从下一题或新练习起生效；当前题沿用开始时的规则，旧版未完成的题目也保留原判题结果。</p></section>;
}
