import { PERSON, SITE, SITE_URL } from "./content";

/**
 * ─── SiteJsonLd ───
 *
 * The home page's structured data (schema.org, JSON-LD), one graph of
 * three nodes that point at each other by id:
 *
 *   WebSite      the site's name (Google's strongest signal for the name
 *                it shows over a result; only read on the home page)
 *   ProfilePage  this page, a profile of one person (Google's markup for a
 *                creator's own page)
 *   Person       who it is: name, role, where, what they know, where else
 *                they are (sameAs) — every fact one the page shows
 *
 * Rendered in the page, as Next recommends (its JSON-LD guide), its "<"
 * escaped so no string in it could ever close the script.
 *
 * Server component: markup only.
 */
export default function SiteJsonLd() {
  const home = `${SITE_URL}/`;
  const person = `${home}#person`;
  const graph = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": `${home}#website`,
        url: home,
        name: SITE.name,
        alternateName: SITE.alternateNames,
        inLanguage: SITE.language,
        publisher: { "@id": person },
      },
      {
        "@type": "ProfilePage",
        "@id": `${home}#profile`,
        url: home,
        name: SITE.title,
        description: SITE.description,
        inLanguage: SITE.language,
        isPartOf: { "@id": `${home}#website` },
        mainEntity: { "@id": person },
      },
      {
        "@type": "Person",
        "@id": person,
        name: PERSON.name,
        jobTitle: PERSON.role,
        description: SITE.description,
        url: home,
        email: `mailto:${PERSON.email}`,
        address: { "@type": "PostalAddress", addressCountry: PERSON.country.code },
        homeLocation: { "@type": "Country", name: PERSON.country.name },
        knowsAbout: PERSON.skills,
        sameAs: PERSON.profiles.map((profile) => profile.href),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, "\\u003c") }}
    />
  );
}
