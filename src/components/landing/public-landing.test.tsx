import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { PublicLanding } from "@/components/landing/public-landing";

describe("public landing", () => {
  it.each(["missing", "invalid"] as const)(
    "shows a setup state for %s config without access controls",
    (status) => {
      render(<PublicLanding configurationStatus={status} />);
      expect(screen.getByRole("status")).toHaveTextContent(
        /setup is incomplete/i,
      );
      expect(
        screen.queryByRole("link", {
          name: /garden|memories|achievements|settings/i,
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /sign in|google/i }),
      ).not.toBeInTheDocument();
    },
  );

  it("does not treat complete public config as authentication", async () => {
    const user = userEvent.setup();
    render(<PublicLanding configurationStatus="ready" />);
    expect(screen.getByRole("status")).toHaveTextContent(
      /private sign-in is coming soon/i,
    );
    await user.click(
      screen.getByRole("button", { name: /take a little look/i }),
    );
    expect(
      screen.getByRole("dialog", { name: /small moments, shared/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /sign in|google/i }),
    ).not.toBeInTheDocument();
  });
});
