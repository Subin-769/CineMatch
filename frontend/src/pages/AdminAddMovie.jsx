import { useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Clapperboard, Film, ImagePlus, Plus, Sparkles, Star } from "lucide-react";
import { Link } from "react-router-dom";

import AdminShell from "../components/admin/AdminShell";
import MeterBar from "../components/admin/MeterBar";
import { getInitials } from "../components/admin/adminUtils";

const initialForm = {
  title: "",
  tmdbId: "",
  releaseYear: "",
  genres: "",
  posterUrl: "",
  overview: "",
  language: "en",
  status: "popular",
};

function PosterPreview({ title, releaseYear, posterUrl }) {
  if (posterUrl.trim()) {
    return <img src={posterUrl} alt={title || "Poster preview"} className="h-full w-full object-cover" />;
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,rgba(246,192,0,0.28),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))] p-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-sm font-semibold text-white">
        {getInitials(title || "Movie")}
      </div>
      <div className="mt-3 text-sm font-semibold text-white">{title || "New movie"}</div>
      <div className="mt-1 text-xs text-white/45">{releaseYear || "No year"}</div>
    </div>
  );
}

export default function AdminAddMovie() {
  const [form, setForm] = useState(initialForm);
  const [toastMessage, setToastMessage] = useState("");

  const genres = useMemo(
    () =>
      form.genres
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    [form.genres]
  );

  const completionScore = useMemo(() => {
    let score = 0;
    if (form.title.trim()) score += 24;
    if (form.tmdbId.trim()) score += 18;
    if (form.posterUrl.trim()) score += 18;
    if (form.overview.trim()) score += 20;
    if (genres.length) score += 20;
    return score;
  }, [form, genres.length]);

  const handleChange = (key) => (event) => {
    setForm((current) => ({
      ...current,
      [key]: event.target.value,
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setToastMessage("Add movie UI is ready. Connect this form to an admin movie-create/import endpoint when backend support is added.");
    window.setTimeout(() => setToastMessage(""), 2800);
  };

  return (
    <AdminShell
      title="Add Movie"
      subtitle="Prepare a cleaner movie entry workflow for catalog, metadata, and AI readiness."
      lastUpdatedAt={new Date().toISOString()}
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/admin/movies"
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white/70 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to movies</span>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.03))] p-5 md:p-6">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Catalog Entry</p>
                <h2 className="mt-2 text-xl font-semibold text-white">Movie setup form</h2>
                <p className="mt-2 max-w-xl text-sm text-white/45">
                  Capture the core metadata needed for clean catalog cards, stronger admin review, and better recommendation readiness.
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#433615] bg-[#2d2411] text-[#f6c000]">
                <Plus className="h-5 w-5" />
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-sm text-white/55">Movie title</span>
                  <input
                    value={form.title}
                    onChange={handleChange("title")}
                    placeholder="Enter movie title"
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">TMDB ID</span>
                  <input
                    value={form.tmdbId}
                    onChange={handleChange("tmdbId")}
                    placeholder="Enter TMDB id"
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="space-y-2">
                  <span className="text-sm text-white/55">Release year</span>
                  <input
                    value={form.releaseYear}
                    onChange={handleChange("releaseYear")}
                    placeholder="2026"
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">Language</span>
                  <select
                    value={form.language}
                    onChange={handleChange("language")}
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white/75 outline-none"
                  >
                    <option value="en">English</option>
                    <option value="hi">Hindi</option>
                    <option value="ko">Korean</option>
                    <option value="ja">Japanese</option>
                    <option value="fr">French</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-sm text-white/55">Status label</span>
                  <select
                    value={form.status}
                    onChange={handleChange("status")}
                    className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white/75 outline-none"
                  >
                    <option value="popular">Popular</option>
                    <option value="trending">Trending</option>
                    <option value="classic">Classic</option>
                    <option value="needs_attention">Needs attention</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2">
                <span className="text-sm text-white/55">Genres</span>
                <input
                  value={form.genres}
                  onChange={handleChange("genres")}
                  placeholder="Drama, Thriller, Science Fiction"
                  className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-white/55">Poster URL</span>
                <input
                  value={form.posterUrl}
                  onChange={handleChange("posterUrl")}
                  placeholder="https://image.tmdb.org/t/p/w500/..."
                  className="w-full rounded-2xl border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-white/55">Overview</span>
                <textarea
                  rows={6}
                  value={form.overview}
                  onChange={handleChange("overview")}
                  placeholder="Add a short synopsis for the catalog and recommendation engine"
                  className="w-full rounded-[1.5rem] border border-white/10 bg-[#141414] px-4 py-3 text-sm text-white placeholder:text-white/25 outline-none transition focus:border-[#f6c000]/30"
                />
              </label>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Metadata</div>
                  <div className="mt-2 text-sm text-white/75">Title, poster, and overview for clean admin display.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">Catalog</div>
                  <div className="mt-2 text-sm text-white/75">Genres and language help browsing and segmentation.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="text-xs uppercase tracking-[0.16em] text-white/35">AI Ready</div>
                  <div className="mt-2 text-sm text-white/75">The more complete the entry, the better recommendation quality.</div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 rounded-2xl bg-[#f6c000] px-5 py-3 text-sm font-medium text-black transition hover:bg-[#ffd54d]"
                >
                  <Plus className="h-4 w-4" />
                  <span>Create movie design</span>
                </button>
                <Link
                  to="/admin/movies"
                  className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm text-white/70 transition hover:text-white"
                >
                  <span>Cancel</span>
                </Link>
              </div>
            </form>
          </section>

          <section className="space-y-6">
            <div className="rounded-[2rem] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] p-6">
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Live Preview</p>

              <div className="mt-5 overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.03]">
                <div className="aspect-[16/10] overflow-hidden">
                  <PosterPreview title={form.title} releaseYear={form.releaseYear} posterUrl={form.posterUrl} />
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-xl font-semibold text-white">{form.title.trim() || "New movie"}</h3>
                <p className="mt-1 text-sm text-white/45">{form.releaseYear.trim() || "Year unknown"}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {(genres.length ? genres : ["Uncategorized"]).slice(0, 3).map((genre) => (
                  <span
                    key={genre}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-white/70"
                  >
                    {genre}
                  </span>
                ))}
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm text-white/55">
                      <Sparkles className="h-4 w-4 text-[#f6c000]" />
                      <span>Readiness score</span>
                    </div>
                    <p className="mt-2 text-sm text-white/45">Visual estimate based on field completeness.</p>
                  </div>
                  <div className="text-2xl font-semibold text-white">{completionScore}%</div>
                </div>
                <div className="mt-4">
                  <MeterBar value={completionScore} />
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.03] p-5">
                <div className="flex items-center gap-3">
                  <Clapperboard className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm text-white/70">Overview preview</span>
                </div>
                <p className="mt-3 text-sm leading-6 text-white/55">
                  {form.overview.trim() || "Overview text will appear here once added."}
                </p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6">
              <div className="flex items-center gap-3">
                <Film className="h-5 w-5 text-sky-300" />
                <h3 className="text-base font-semibold text-white">Quick checklist</h3>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  <span>Add the TMDB ID when available so syncing stays reliable.</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <ImagePlus className="mt-0.5 h-4 w-4 text-[#f6c000]" />
                  <span>Poster and overview have the biggest impact on dashboard polish.</span>
                </div>
                <div className="flex items-start gap-3 text-sm text-white/65">
                  <Star className="mt-0.5 h-4 w-4 text-fuchsia-300" />
                  <span>Genres improve filtering, discovery, and recommendation relevance.</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {toastMessage ? (
          <div className="fixed bottom-6 right-6 z-50 rounded-full border border-white/10 bg-[#111111] px-4 py-2 text-sm text-white shadow-[0_20px_60px_-30px_rgba(0,0,0,0.95)]">
            {toastMessage}
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
