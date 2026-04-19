import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import Home from "../pages/Home";
import { AuthContext } from "../auth/AuthContext";

vi.mock("../components/AppLayout", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/FeaturedHero", () => ({
  default: () => <div>Hero</div>,
}));

vi.mock("../components/MovieCard", () => ({
  default: ({ movie }) => <div>{movie?.title}</div>,
}));

vi.mock("swiper/react", () => ({
  Swiper: ({ children }) => <div>{children}</div>,
  SwiperSlide: ({ children }) => <div>{children}</div>,
}));

vi.mock("swiper/css", () => ({}));

vi.mock("../api/recommendations", () => ({
  fetchRecommendedForYou: vi.fn().mockResolvedValue({
    movies: [{ id: 1, title: "Interstellar" }],
    explanation: {
      reason_text: "Because you rated Interstellar 5★.",
    },
  }),
  fetchTrendingMovies: vi.fn().mockResolvedValue([]),
  fetchNewReleases: vi.fn().mockResolvedValue([]),
  fetchLovedMovies: vi.fn().mockResolvedValue({ movies: [] }),
  fetchRatedMovies: vi.fn().mockResolvedValue({ movies: [] }),
  fetchWatchlistMovies: vi.fn().mockResolvedValue({ movies: [] }),
  fetchFavoriteGenres: vi.fn().mockResolvedValue([]),
  fetchDiscoverByGenre: vi.fn().mockResolvedValue([]),
}));

describe("Recommended For You carousel", () => {
  beforeEach(() => {
    window.requestIdleCallback = (cb) => {
      cb();
      return 0;
    };
    window.cancelIdleCallback = () => {};
  });

  it("renders recommended movies with explanation text", async () => {
    render(
      <MemoryRouter>
        <AuthContext.Provider value={{ user: { id: 7 }, loading: false }}>
          <Home />
        </AuthContext.Provider>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("Recommended For You")).toBeTruthy();
    });

    expect(
      screen.getByText("Because you rated Interstellar 5★.")
    ).toBeTruthy();

    expect(screen.getByText("Interstellar")).toBeTruthy();
  });
});
