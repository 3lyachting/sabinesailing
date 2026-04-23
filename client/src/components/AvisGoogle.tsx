import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";

type GoogleReview = {
  authorName: string;
  rating: number;
  text: string;
  time: number;
};

type GoogleReviewsResponse = {
  placeId: string;
  name: string;
  rating: number;
  userRatingsTotal: number;
  url: string;
  reviews: GoogleReview[];
};

export default function AvisGoogle() {
  const [data, setData] = useState<GoogleReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    fetch("/api/google-reviews")
      .then(async response => {
        const body = (await response.json()) as GoogleReviewsResponse | { error: string };
        if (!response.ok) {
          throw new Error((body as { error?: string }).error || "Impossible de charger les avis Google");
        }
        if (mounted) {
          setData(body as GoogleReviewsResponse);
        }
      })
      .catch((err: Error) => {
        if (mounted) setError(err.message);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const review of data?.reviews || []) {
      const key = Math.min(5, Math.max(1, Math.round(review.rating))) as 1 | 2 | 3 | 4 | 5;
      counts[key] += 1;
    }
    const total = (data?.reviews || []).length || 1;
    return [5, 4, 3, 2, 1].map(stars => ({
      stars,
      count: counts[stars as 1 | 2 | 3 | 4 | 5],
      percent: (counts[stars as 1 | 2 | 3 | 4 | 5] / total) * 100,
    }));
  }, [data]);

  const placeUrl =
    data?.url || "https://www.google.com/maps/search/?api=1&query=Sabine+Sailing+La+Ciotat";

  const displayedReviews = (data?.reviews || []).slice(0, 4);

  return (
    <section className="editorial-section bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Titre */}
        <div className="text-center mb-16 lg:mb-20">
          <span className="editorial-kicker">Avis clients</span>
          <h2 className="editorial-title editorial-title-centered mt-4 mb-4" style={{ fontFamily: "Syne, sans-serif" }}>
            Ce que disent nos clients
          </h2>
          <p className="editorial-lead max-w-2xl">
            Découvrez les témoignages de nos passagers et leur expérience à bord de Sabine
          </p>
        </div>

        {/* Note globale + Widget Google */}
        <div className="grid lg:grid-cols-3 gap-8 lg:gap-10 items-start">
          {/* Résumé des avis */}
          <div className="editorial-panel bg-gradient-to-b from-[oklch(0.99_0.004_95)] to-[oklch(0.96_0.008_220)] p-8">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className="w-6 h-6 fill-[oklch(0.72_0.11_85)] text-[oklch(0.72_0.11_85)]"
                  />
                ))}
              </div>
              <div className="text-5xl font-extrabold text-[oklch(0.15_0.05_220)] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                {loading ? "..." : data ? data.rating.toFixed(1) : "-"}
              </div>
              <p className="text-[oklch(0.45_0.04_220)] text-sm mb-6">
                {loading
                  ? "Chargement des avis Google..."
                  : data
                    ? `basé sur ${data.userRatingsTotal} avis Google`
                    : "Connexion Google indisponible"}
              </p>
              <a
                href={placeUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-6 py-3 bg-[oklch(0.2_0.06_240)] text-white rounded-full font-semibold text-sm hover:bg-[oklch(0.16_0.05_240)] transition-colors"
              >
                Voir tous les avis Google
              </a>
            </div>

            {/* Stats */}
            <div className="mt-8 space-y-3 border-t border-[oklch(0.88_0.03_220)] pt-6">
              {stats.map((stat) => (
                <div key={stat.stars} className="flex items-center gap-3">
                  <div className="flex items-center gap-1 w-12">
                    {[...Array(stat.stars)].map((_, i) => (
                      <Star
                        key={i}
                        className="w-3 h-3 fill-[oklch(0.72_0.11_85)] text-[oklch(0.72_0.11_85)]"
                      />
                    ))}
                  </div>
                  <div className="flex-1 h-2 bg-[oklch(0.88_0.03_220)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[oklch(0.72_0.11_85)]"
                      style={{ width: `${stat.percent}%` }}
                    />
                  </div>
                  <span className="text-xs text-[oklch(0.45_0.04_220)] w-8 text-right">
                    {stat.count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Widget Google Reviews */}
          <div className="lg:col-span-2">
            <div className="editorial-panel overflow-hidden">
              {/* Google Reviews Widget */}
              <div className="p-7 lg:p-8">
                <div className="flex items-center gap-3 mb-6 pb-6 border-b border-slate-200">
                  <div className="w-10 h-10 rounded-full bg-[oklch(0.95_0.015_220)] flex items-center justify-center">
                    <svg
                      className="w-6 h-6"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        fill="#4285F4"
                      />
                      <path
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        fill="#34A853"
                      />
                      <path
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        fill="#FBBC05"
                      />
                      <path
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        fill="#EA4335"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[oklch(0.2_0.06_240)]">Google Reviews</p>
                    <p className="text-xs text-slate-500">Avis vérifiés</p>
                  </div>
                </div>

                {/* Avis individuels */}
                <div className="space-y-4">
                  {error && (
                    <div className="pb-4 border-b border-slate-100">
                      <p className="font-semibold text-slate-900 text-sm">Avis Google temporairement indisponibles</p>
                      <p className="text-sm text-slate-600 leading-relaxed mt-1">
                        Vous pouvez consulter les avis directement sur Google via le lien ci-dessous.
                      </p>
                    </div>
                  )}
                  {!error && displayedReviews.length === 0 && !loading && (
                    <div className="pb-4 border-b border-slate-100">
                      <p className="font-semibold text-slate-900 text-sm">Aucun avis à afficher</p>
                      <p className="text-sm text-slate-600 leading-relaxed mt-1">
                        Ouvrez la fiche Google pour consulter tous les avis Sabine Sailing.
                      </p>
                    </div>
                  )}
                  {displayedReviews.map((review, i) => (
                    <div key={i} className="pb-4 border-b border-slate-100 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-semibold text-slate-900 text-sm">{review.authorName}</p>
                        <div className="flex gap-1">
                          {[...Array(Math.round(review.rating))].map((_, j) => (
                            <Star
                              key={j}
                              className="w-4 h-4 fill-[oklch(0.72_0.11_85)] text-[oklch(0.72_0.11_85)]"
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        {review.text || "Avis Google sans commentaire texte."}
                      </p>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-6 pt-6 border-t border-slate-200">
                  <a
                    href={placeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[oklch(0.28_0.08_240)] hover:text-[oklch(0.22_0.08_240)] transition-colors"
                  >
                    Lire tous les avis sur Google →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Avantages */}
        <div className="mt-16 lg:mt-20 grid sm:grid-cols-3 gap-6 lg:gap-8">
          {[
            {
              icon: "✓",
              titre: "Avis vérifiés",
              desc: "Tous les avis proviennent de clients ayant réellement réservé avec nous",
            },
            {
              icon: "★",
              titre: "Note excellente",
              desc: data?.rating
                ? `${data.rating.toFixed(1)} étoiles en moyenne : la satisfaction de nos passagers`
                : "Des passagers satisfaits et des avis authentiques publiés sur Google",
            },
            {
              icon: "🔗",
              titre: "Transparent",
              desc: "Retrouvez tous les détails sur notre fiche Google Business",
            },
          ].map((item, i) => (
            <div key={i} className="editorial-panel rounded-2xl p-6">
              <div className="text-3xl mb-3">{item.icon}</div>
              <h3 className="font-bold text-[oklch(0.15_0.05_220)] mb-2" style={{ fontFamily: "Syne, sans-serif" }}>
                {item.titre}
              </h3>
              <p className="text-sm text-[oklch(0.45_0.04_220)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
