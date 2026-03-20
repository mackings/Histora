import { NavLink } from "react-router-dom";

import { readingShelves } from "../../app-data";
import heroMemory from "../../assets/hero-memory.svg";

export function OnboardingPage({
  IconComponent,
  SectionLabelComponent
}: {
  IconComponent: React.ComponentType<{ name: "arrow"; className?: string }>;
  SectionLabelComponent: React.ComponentType<{ children: React.ReactNode }>;
}) {
  return (
    <main className="page-shell">
      <section className="hero-layout onboarding-hero">
        <article className="hero-copy-card card">
          <SectionLabelComponent>WELCOME_TO_HISTORA</SectionLabelComponent>
          <h1>Turn your life into chapters, statuses, and timelines.</h1>
          <p>
            Build a social archive from real memories. Write chapter by chapter, post quick status drops, attach media, and control
            who gets access.
          </p>
          <div className="hero-actions">
            <NavLink className="primary-action" to="/signup">
              SIGN UP
              <IconComponent className="button-icon" name="arrow" />
            </NavLink>
            <NavLink className="ghost-action" to="/signin">
              SIGN IN
            </NavLink>
          </div>
          <div className="status-matrix">
            {readingShelves.map((shelf) => (
              <article key={shelf.title} className="status-card">
                <span className="story-tag">{shelf.mood}</span>
                <strong>{shelf.title}</strong>
                <span>{shelf.meta}</span>
                <small>{shelf.reactions}</small>
              </article>
            ))}
          </div>
        </article>

        <article className="hero-visual-card card">
          <div className="image-frame">
            <img alt="Histora onboarding preview" className="feature-image" src={heroMemory} />
          </div>
          <div className="hero-overlay-stack">
            <article className="overlay-card">
              <SectionLabelComponent>START_HERE</SectionLabelComponent>
              <h3>PRIVATE MEMORIES, PUBLIC STORIES, ANONYMOUS ADVICE</h3>
              <p>Start with your first profile and move into chapters, statuses, contributors, and premium media.</p>
            </article>
          </div>
        </article>
      </section>
    </main>
  );
}
