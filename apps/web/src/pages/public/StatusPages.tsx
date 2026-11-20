import { Link } from "react-router-dom";

function StatusPage({ code, title, text }: { code: string; title: string; text: string }) {
  return (
    <main className="grid min-h-screen place-items-center px-4 text-center">
      <div className="space-y-4">
        <p className="font-display text-6xl font-semibold text-primary">{code}</p>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-muted-foreground">{text}</p>
        <Link
          to="/"
          className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}

export const ForbiddenPage = () => (
  <StatusPage code="403" title="Access denied" text="Your role doesn't have access to this area." />
);

export const NotFoundPage = () => (
  <StatusPage code="404" title="Page not found" text="That page doesn't exist." />
);
