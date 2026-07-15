import { ProjectLauncher } from "@/components/ProjectLauncher";

export default function HomePage() {
  return (
    <main className="landing-shell">
      <section className="landing-card">
        <div className="brand-mark" aria-hidden="true">G</div>
        <p className="eyebrow">Gideon product capture</p>
        <h1>Record the workflows you approve—not a mystery tour of your product.</h1>
        <p className="lede">Choose a project. Gideon verifies the session and every deployment dependency before showing connection or recording controls.</p>
        <ProjectLauncher />
      </section>
    </main>
  );
}
