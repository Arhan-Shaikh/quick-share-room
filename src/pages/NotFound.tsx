import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <>
      <Helmet>
        <title>Page not found — DropZone</title>
        <meta
          name="description"
          content="The page you were looking for doesn't exist on DropZone. Return home to share a file or retrieve one with a room code."
        />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://quickshareroom.lovable.app/404" />
        <meta property="og:title" content="Page not found — DropZone" />
        <meta
          property="og:description"
          content="The page you were looking for doesn't exist on DropZone."
        />
        <meta property="og:url" content="https://quickshareroom.lovable.app/404" />
      </Helmet>
      <main className="flex min-h-screen items-center justify-center bg-muted">
        <div className="text-center">
          <h1 className="mb-4 text-4xl font-bold text-foreground">404 — Page not found</h1>
          <p className="mb-4 text-xl text-foreground">
            Oops! That page doesn't exist on DropZone.
          </p>
          <a href="/" className="text-primary underline hover:text-primary/90">
            Return to Home
          </a>
        </div>
      </main>
    </>
  );
};

export default NotFound;
