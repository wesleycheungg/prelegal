// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { DocumentForm } from "./document-form";
import type { DocumentValues } from "@/lib/document-values";
import type { DocumentDefinition } from "@/lib/templates";
import { loadDocument, loadFixtures, sampleValues } from "@/test/helpers";

let mnda: DocumentDefinition;

beforeAll(async () => {
  mnda = await loadFixtures();
});

function renderForm(values: DocumentValues = sampleValues(), document = mnda) {
  const onChange = vi.fn();
  render(
    <DocumentForm
      schema={document.schema}
      values={values}
      onChange={onChange}
    />,
  );
  return { onChange };
}

describe("DocumentForm", () => {
  it("captions every field with the cover page's own heading", () => {
    renderForm();

    for (const label of [
      "Purpose",
      "Effective Date",
      "MNDA Term",
      "Term of Confidentiality",
      "Governing Law",
      "Jurisdiction",
      "MNDA Modifications",
    ]) {
      expect(
        screen.getByText(label, { selector: "label, legend" }),
      ).toBeInTheDocument();
    }
  });

  it("shows the template's hint under a field", () => {
    renderForm();

    expect(
      screen.getByText("How Confidential Information may be used"),
    ).toBeInTheDocument();
  });

  it("reports a typed value under its field's name", async () => {
    const user = userEvent.setup();
    const { onChange } = renderForm(
      sampleValues({ fields: { governing_law: "" } }),
    );

    await user.type(screen.getByLabelText("Governing Law"), "D");

    expect(onChange).toHaveBeenCalledWith({
      fields: expect.objectContaining({ governing_law: "D" }),
    });
  });

  it("shows guidance from the template in an empty input", () => {
    renderForm();

    expect(screen.getByLabelText("Governing Law")).toHaveAttribute(
      "placeholder",
      "Fill in state",
    );
  });

  describe("choices", () => {
    it("labels each radio with the template's own sentence", () => {
      renderForm();

      expect(
        screen.getByText(
          "Continues until terminated in accordance with the terms of the MNDA.",
        ),
      ).toBeInTheDocument();
    });

    it("selects the option held in the values", () => {
      renderForm(
        sampleValues({ choices: { mnda_term: { index: 1, number: "2" } } }),
      );

      const term = screen.getByRole("group", { name: /MNDA Term/ });
      const [fixed, untilTerminated] = within(term).getAllByRole("radio");

      expect(fixed).not.toBeChecked();
      expect(untilTerminated).toBeChecked();
    });

    it("reports the option when a radio is picked", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      const term = screen.getByRole("group", { name: /MNDA Term/ });
      await user.click(within(term).getAllByRole("radio")[1]);

      expect(onChange).toHaveBeenCalledWith({
        choices: expect.objectContaining({
          mnda_term: { index: 1, number: "2" },
        }),
      });
    });

    it("puts a number input where the template's placeholder sits", () => {
      renderForm();

      expect(screen.getByLabelText("MNDA Term length")).toHaveValue(2);
    });

    it("refuses a count that is not a whole number", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(
        sampleValues({ choices: { mnda_term: { index: 0, number: "" } } }),
      );

      await user.type(screen.getByLabelText("MNDA Term length"), "-");

      // The wording would otherwise read "Expires -3 years from Effective Date."
      expect(onChange).not.toHaveBeenCalledWith(
        expect.objectContaining({
          choices: expect.objectContaining({
            mnda_term: expect.objectContaining({ number: "-" }),
          }),
        }),
      );
    });

    it("chooses the option a typed number belongs to", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(
        sampleValues({ choices: { mnda_term: { index: 1, number: "2" } } }),
      );

      await user.click(screen.getByLabelText("MNDA Term length"));

      expect(onChange).toHaveBeenCalledWith({
        choices: expect.objectContaining({
          mnda_term: expect.objectContaining({ index: 0 }),
        }),
      });
    });
  });

  describe("the date", () => {
    it("offers today without typing", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm(
        sampleValues({ fields: { effective_date: "" } }),
      );

      await user.click(screen.getByRole("button", { name: "Today" }));

      const [[patch]] = onChange.mock.calls;
      expect(patch.fields.effective_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("says a blank date can be completed at signing", () => {
      renderForm();

      expect(
        screen.getByText("Leave blank to complete by hand at signing"),
      ).toBeInTheDocument();
    });
  });

  describe("the parties", () => {
    it("names each group as the document names it", () => {
      renderForm();

      expect(
        screen.getByRole("group", { name: "PARTY 1" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "PARTY 2" }),
      ).toBeInTheDocument();
    });

    it("keeps the two parties apart", async () => {
      const user = userEvent.setup();
      const { onChange } = renderForm();

      const party2 = screen.getByRole("group", { name: "PARTY 2" });
      await user.type(within(party2).getByLabelText("Title"), "!");

      expect(onChange).toHaveBeenCalledWith({
        party2: expect.objectContaining({ title: "General Counsel!" }),
      });
    });
  });

  describe("another document", () => {
    it("builds a form from that document's own fields and parties", async () => {
      const pilot = await loadDocument("pilot-agreement");
      const { createDefaultValues } = await import("@/lib/document-values");

      renderForm(createDefaultValues(pilot.schema), pilot);

      expect(
        screen.getByRole("group", { name: "PROVIDER" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("group", { name: "CUSTOMER" }),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Pilot Period", { selector: "legend" }),
      ).toBeInTheDocument();
      expect(screen.queryByText("MNDA Term")).not.toBeInTheDocument();
    });
  });
});
