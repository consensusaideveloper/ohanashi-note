import { useState, useEffect } from "react";

type Orientation = "portrait" | "landscape";

const LANDSCAPE_QUERY = "(orientation: landscape)";

export function useOrientation(): Orientation {
  const [orientation, setOrientation] = useState<Orientation>(() => {
    if (typeof window === "undefined") {
      return "portrait";
    }
    return window.matchMedia(LANDSCAPE_QUERY).matches
      ? "landscape"
      : "portrait";
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(LANDSCAPE_QUERY);

    const handleChange = (e: MediaQueryListEvent): void => {
      setOrientation(e.matches ? "landscape" : "portrait");
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return orientation;
}
