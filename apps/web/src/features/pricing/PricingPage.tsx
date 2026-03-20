import { pricingPlans } from "../../app-data";

export function PricingPage({
  IconComponent,
  SectionLabelComponent
}: {
  IconComponent: React.ComponentType<{ name: "arrow" | "check"; className?: string }>;
  SectionLabelComponent: React.ComponentType<{ children: React.ReactNode }>;
}) {
  return (
    <main className="page-shell">
      <section className="pricing-hero">
        <article className="pricing-panel card">
          <SectionLabelComponent>SUBSCRIPTION_PLAN</SectionLabelComponent>
          <h1>CHOOSE YOUR ARCHIVE CONTROL</h1>
          <p>Select the writing depth and media capacity you need to manage your personal history.</p>
          <div className="plan-stack">
            {pricingPlans.map((plan, index) => (
              <article className={index === 1 ? "plan-card plan-card-featured" : "plan-card"} key={plan.name}>
                <span className="story-tag">{plan.name.toUpperCase()}</span>
                <h2>{plan.price}</h2>
                <p>{plan.description}</p>
                <ul className="plan-feature-list">
                  {plan.features.map((feature) => (
                    <li key={feature}>
                      <IconComponent className="inline-icon" name="check" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <button className={index === 1 ? "primary-action block-action" : "ghost-action block-action"} type="button">
                  {index === 1 ? "UPGRADE NOW" : "CURRENT REALITY"}
                </button>
              </article>
            ))}
          </div>
        </article>

        <article className="pricing-panel card">
          <SectionLabelComponent>SUBSCRIPTION_MANAGEMENT</SectionLabelComponent>
          <h2>PRO PLAN</h2>
          <div className="management-metrics">
            <div className="metric-box">
              <strong>$12.00 / MONTH</strong>
              <span>ACTIVE</span>
            </div>
            <div className="metric-box">
              <strong>CHAPTERS: 14 / inf</strong>
              <span>ARCHIVE_VOLUME</span>
            </div>
            <div className="metric-box">
              <strong>STORAGE: 2.4GB / inf</strong>
              <span>DATA_CAPACITY</span>
            </div>
          </div>
          <button className="primary-action block-action" type="button">
            CHANGE_PLAN
            <IconComponent className="button-icon" name="arrow" />
          </button>
          <button className="ghost-action block-action" type="button">
            CANCEL_SUBSCRIPTION
          </button>
        </article>
      </section>
    </main>
  );
}
