// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { MndaForm } from "./mnda-form";
import type { CoverPageTemplate } from "@/lib/cover-page-template";
import { type MndaValues, createDefaultValues } from "@/lib/mnda";
import { loadFixtures, sampleValues } from "@/test/helpers";

let template: CoverPageTemplate;

beforeAll(async () => {
  ({ template } = await loadFixtures());
});

function renderForm(values: MndaValues = sampleValues()) {
  const onChange = vi.fn();
  render(<MndaForm template={template} values={values} onChange={onChange} />);
  return { onChange };
}

describe("MndaForm", () => {
  it("labels the fields with the template's own headings", () => {
    renderForm();
    for (const label of [
      "Purpose",
      "Effective Date",
      "Governing Law",
      "Jurisdiction",
      "MNDA Modifications",
    ]) {
      expect(screen.getByLabelText(label), label).toBeInTheDocument();
    }
  });

  it("shows the template's <label> hints as help text", () => {
    renderForm();
    expect(
      screen.getByText("How Confidential Information may be used"),
    ).toBeInTheDocument();
    expect(screen.getByText("The length of this MNDA")).toBeInTheDocument();
  });

  it("uses the template's bracketed guidance as input placeholders", () => {
    renderForm();
    expect(screen.getByLabelText("Governing Law")).toHaveAttribute(
      "placeholder",
      "Fill in state",
    );
    expect(screen.getByLabelText("Jurisdiction")).toHaveAttribute(
      "placeholder",
      expect.stringContaining("Fill in city or county"),
    );
  });

  it("groups the fields for each party", () => {
    renderForm();
    for (const group of ["Agreement", "Party 1", "Party 2"]) {
      expect(screen.getByRole("group", { name: group }), group).toBeInTheDocument();
    }
  });

  it("reports a single edited character back to the caller", async () => {
    const user = userEvent.setup();
    const { onChange } = renderForm(sampleValues({ governingLaw: "" }));

    await user.type(screen.getByLabelText("Governing Law"), "D");

    expect(onChange).toHaveBeenCalledWith({ governingLaw: "D" });
  });

  it("reports edits to a party without disturbing the other", async () => {
    const user = userEvent.setup();
    const values = sampleValues();
    const { onChange } = renderForm(values);

    const party1 = screen.getByRole("group", { name: "Party 1" });
    await user.type(within(party1).getByLabelText("Title"), "!");

    expect(onChange).toHaveBeenCalledWith({
      party1: { ...values.party1, title: `${values.party1.title}!` },
    });
    expect(onChange.mock.calls[0][0].party2).toBeUndefined();
  });

  describe("term choices", () => {
    it("uses the template's wording for the radio options", () => {
      renderForm();
      expect(
        screen.getByLabelText(/Continues until terminated/),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(/In perpetuity/)).toBeInTheDocument();
    });

    it("reflects the current selection", () => {
      renderForm(sampleValues({ mndaTermKind: "untilTerminated" }));
      expect(screen.getByLabelText(/Continues until terminated/)).toBeChecked();
    });

    it("switches to the open-ended term when its option is chosen", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      await user.click(screen.getByLabelText(/Continues until terminated/));

      expect(onChange).toHaveBeenCalledWith({ mndaTermKind: "untilTerminated" });
    });

    it("switches confidentiality to perpetual when chosen", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      await user.click(screen.getByLabelText(/In perpetuity/));

      expect(onChange).toHaveBeenCalledWith({ confidentialityKind: "perpetual" });
    });

    it("offers a labelled number input for each fixed term", () => {
      renderForm();
      expect(screen.getByLabelText("MNDA Term length")).toHaveValue(2);
      expect(screen.getByLabelText("Term of Confidentiality length")).toHaveValue(3);
    });

    it("reports a changed year count", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(sampleValues({ mndaTermYears: "" }));

      await user.type(screen.getByLabelText("MNDA Term length"), "5");

      expect(onChange).toHaveBeenCalledWith({ mndaTermYears: "5" });
    });

    // fireEvent rather than userEvent: a number input silently swallows some of
    // these before they reach the handler, and the point is to prove the form
    // sanitises whatever value it is handed.
    it.each([
      ["-3", "3", "a negative term cannot be signed"],
      ["1.5", "15", "a term is whole years"],
      ["0", "", "a zero-year term is void, so it counts as unset"],
      ["007", "7", "leading zeros are noise"],
    ])("sanitises %o to %o because %s", (typed, expected) => {
      const { onChange } = renderForm(sampleValues({ mndaTermYears: "" }));

      fireEvent.change(screen.getByLabelText("MNDA Term length"), {
        target: { value: typed },
      });

      expect(onChange).toHaveBeenCalledWith({ mndaTermYears: expected });
    });

    it("selects the fixed option when the year count is focused", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(
        sampleValues({ mndaTermKind: "untilTerminated" }),
      );

      await user.click(screen.getByLabelText("MNDA Term length"));

      expect(onChange).toHaveBeenCalledWith({ mndaTermKind: "fixed" });
    });
  });

  describe("effective date", () => {
    it("offers a date input", () => {
      renderForm();
      expect(screen.getByLabelText("Effective Date")).toHaveAttribute(
        "type",
        "date",
      );
    });

    it("explains that it may be left blank", () => {
      renderForm();
      expect(
        screen.getByText("Leave blank to complete by hand at signing"),
      ).toBeInTheDocument();
    });

    it("sets today's date on request", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(sampleValues({ effectiveDate: "" }));

      await user.click(screen.getByRole("button", { name: "Today" }));

      const [[patch]] = onChange.mock.calls;
      expect(patch.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  it("does not submit or reload the page", async () => {
    const user = userEvent.setup();
    renderForm(createDefaultValues(template));
    const submit = vi.fn();

    const form = document.querySelector("form")!;
    form.addEventListener("submit", submit);
    await user.type(screen.getByLabelText("Governing Law"), "{Enter}");

    for (const [event] of submit.mock.calls) expect(event.defaultPrevented).toBe(true);
  });
});
