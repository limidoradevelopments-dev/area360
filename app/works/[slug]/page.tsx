import type { Metadata } from "next";
import { notFound } from "next/navigation";

import FilmGrain from "@/components/ui/FilmGrain";
import { WorkDetailSection } from "@/components/work-detail";
import { nextWork, WORKS, workBySlug } from "@/components/works/content";

/**
 * A work's page, one for every work in components/works/content.ts, made
 * at the build (a static export: out/works/<slug>.html). Composition only.
 *
 * ONLY THE WORKS LISTED: a slug the list does not have is the 404, never
 * a page made on request (a static export has no server to make one).
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return WORKS.map((work) => ({ slug: work.slug }));
}

interface WorkPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: WorkPageProps): Promise<Metadata> {
  const work = workBySlug((await params).slug);
  if (!work) return {};
  return { title: `${work.title} — kavi`, description: work.about ?? work.scope };
}

export default async function WorkPage({ params }: WorkPageProps) {
  const work = workBySlug((await params).slug);
  if (!work) notFound();
  return (
    <>
      <main className="relative w-full flex-1 overflow-x-clip">
        <WorkDetailSection work={work} next={nextWork(work)} />
      </main>
      <FilmGrain />
    </>
  );
}
