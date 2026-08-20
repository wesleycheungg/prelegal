// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { AgreementDocument } from "./agreement-document";
import { type Agreement, buildAgreement } from "@/lib/agreement";
import type { DocumentValues } from "@/lib/document-values";
import type { DocumentDefinition } from "@/lib/templates";
import { loadFixtures, sampleValues } from "@/test/helpers";

let mnda: DocumentDefinition;

const agreementFor = (values: DocumentValues = sampleValues()): Agreement =>
  buildAgreement(mnda.schema, values, mnda.standardTerms);

beforeAll(async () => {
  mnda = await loadFixtures();
});

describe("AgreementDocument", () => {
  it("shows the agreement title as the heading", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Mutual Non-Disclosure Agreement",
      }),
    ).toBeInTheDocument();
  });

  it("separates the cover page from the standard terms", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    expect(
      screen.getByRole("heading", { name: "Cover Page" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Standard Terms" }),
    ).toBeInTheDocument();
  });

  it("shows every cover page field with its heading", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    for (const heading of [
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law & Jurisdiction",
      "MNDA Modifications",
    ]) {
      expect(
        screen.getByRole("heading", { name: heading }),
        heading,
      ).toBeInTheDocument();
    }
  });

  it("shows the resolved values", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    expect(screen.getByText("August 3, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Expires 2 years from Effective Date."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Delaware/)).toBeInTheDocument();
  });

  it("labels the governing law and jurisdiction lines", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    expect(screen.getByText(/Governing Law:/)).toBeInTheDocument();
    expect(screen.getByText(/Jurisdiction:/)).toBeInTheDocument();
  });

  it("renders a rule to write on where a value is missing", () => {
    const { container } = render(
      <AgreementDocument
        agreement={agreementFor(
          sampleValues({ fields: { governing_law: "" } }),
        )}
      />,
    );
    // The rule is decorative: it carries no text for a screen reader to read.
    expect(
      container.querySelectorAll('[aria-hidden="true"]').length,
    ).toBeGreaterThan(0);
  });

  it("shows no rules when every value is supplied", () => {
    const { container } = render(
      <AgreementDocument agreement={agreementFor()} />,
    );
    expect(container.querySelectorAll('[aria-hidden="true"]')).toHaveLength(0);
  });

  it("shows the signing statement", () => {
    render(<AgreementDocument agreement={agreementFor()} />);
    expect(screen.getByText(/By signing this Cover Page/)).toBeInTheDocument();
  });

  describe("signature table", () => {
    it("has a column for each party", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      expect(
        screen.getByRole("columnheader", { name: "PARTY 1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("columnheader", { name: "PARTY 2" }),
      ).toBeInTheDocument();
    });

    it("puts each party's details in its own column", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      const row = screen
        .getByRole("rowheader", { name: "Print Name" })
        .closest("tr")!;
      const cells = within(row).getAllByRole("cell");

      expect(cells[0]).toHaveTextContent("Ada Lovelace");
      expect(cells[1]).toHaveTextContent("Alan Turing");
    });

    it("leaves the hand-signed rows empty", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      for (const label of ["Signature", "Date"]) {
        const row = screen
          .getByRole("rowheader", { name: label })
          .closest("tr")!;
        for (const cell of within(row).getAllByRole("cell")) {
          expect(cell, label).toHaveTextContent("");
        }
      }
    });

    it("keeps a multi-line notice address on separate lines", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      const row = screen
        .getByRole("rowheader", { name: "Notice Address" })
        .closest("tr")!;
      const cells = within(row).getAllByRole("cell");

      expect(cells[1].textContent).toContain("\n");
      expect(cells[1]).toHaveTextContent(/1 Globex Way/);
    });
  });

  describe("standard terms", () => {
    it("renders the clauses as an ordered list so they are numbered", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      const list = screen.getByRole("list");
      expect(within(list).getAllByRole("listitem")).toHaveLength(11);
    });

    it("emphasises clause headings", () => {
      const { container } = render(
        <AgreementDocument agreement={agreementFor()} />,
      );
      const bold = [...container.querySelectorAll("strong")].map(
        (element) => element.textContent,
      );
      expect(bold).toContain("Introduction");
      expect(bold).toContain("Disclosing Party");
    });

    it("renders links with their target", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      const [licence] = screen.getAllByRole("link", { name: "CC BY 4.0" });
      expect(licence).toHaveAttribute(
        "href",
        expect.stringContaining("creativecommons.org"),
      );
    });

    it("carries the Common Paper attribution required by the licence", () => {
      render(<AgreementDocument agreement={agreementFor()} />);
      expect(screen.getAllByText(/free to use under/).length).toBeGreaterThan(
        0,
      );
    });
  });

  it("updates when the values change", () => {
    const { rerender } = render(
      <AgreementDocument agreement={agreementFor()} />,
    );
    expect(
      screen.getByText("Expires 2 years from Effective Date."),
    ).toBeInTheDocument();

    rerender(
      <AgreementDocument
        agreement={agreementFor(
          sampleValues({ choices: { mnda_term: { index: 1, number: "2" } } }),
        )}
      />,
    );
    expect(
      screen.getByText(
        "Continues until terminated in accordance with the terms of the MNDA.",
      ),
    ).toBeInTheDocument();
  });
});
