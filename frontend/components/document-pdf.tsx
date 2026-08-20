import {
  Document,
  Link,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

import type { Agreement, SignatureRow } from "@/lib/agreement";
import type { TextRun } from "@/lib/inline-markdown";

/**
 * The agreement as a downloadable PDF, rendered from the same `Agreement`
 * model as the on-screen preview.
 *
 * Uses the PDF standard Times faces, so no font files are downloaded and the
 * output stays small with real, selectable, searchable text.
 */

/** A rule to write on, for details left unfilled. */
const BLANK = "______________________";

const styles = StyleSheet.create({
  page: {
    fontFamily: "Times-Roman",
    fontSize: 10,
    lineHeight: 1.5,
    paddingVertical: 54,
    paddingHorizontal: 54,
    color: "#000",
  },
  title: {
    fontFamily: "Times-Bold",
    fontSize: 16,
    textAlign: "center",
    marginBottom: 14,
  },
  paragraph: { marginBottom: 10 },
  divider: {
    marginTop: 20,
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#94a3b8",
  },
  dividerText: {
    fontFamily: "Times-Bold",
    fontSize: 9,
    textAlign: "center",
    letterSpacing: 1.2,
  },
  heading: {
    fontFamily: "Times-Bold",
    fontSize: 9,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  bold: { fontFamily: "Times-Bold" },
  link: { color: "#000", textDecoration: "underline" },
  small: { fontSize: 8 },
  clause: { flexDirection: "row", marginBottom: 10 },
  clauseNumber: { width: 22 },
  clauseBody: { flex: 1 },
  table: { marginTop: 4 },
  row: { flexDirection: "row" },
  cell: {
    borderWidth: 1,
    borderColor: "#94a3b8",
    paddingVertical: 6,
    paddingHorizontal: 8,
    // Adjacent cells share an edge, so only the first in a row draws its left.
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  labelCell: { width: "26%", borderLeftWidth: 1 },
  partyCell: { width: "37%" },
  headerCell: { fontFamily: "Times-Bold", textAlign: "center" },
});

export function AgreementPdf({ agreement }: { agreement: Agreement }) {
  return (
    <Document
      title={agreement.title}
      author="Prelegal"
      subject={agreement.title}
    >
      <Page size="LETTER" style={styles.page}>
        <Text style={styles.title}>{agreement.title}</Text>

        <Text style={styles.paragraph}>
          <Runs runs={agreement.intro} />
        </Text>

        <Divider>COVER PAGE</Divider>

        {agreement.fields.map((field) => (
          <View key={field.heading} style={styles.paragraph} wrap={false}>
            <Text style={styles.heading}>{field.heading.toUpperCase()}</Text>
            {field.lines.map((line, index) => (
              <Text key={line.label ?? index}>
                {line.label ? `${line.label}: ` : ""}
                {line.value.trim() || BLANK}
              </Text>
            ))}
          </View>
        ))}

        <Text style={styles.paragraph}>{agreement.signingStatement}</Text>

        <SignatureTable
          rows={agreement.signatureRows}
          partyRoles={agreement.partyRoles}
        />

        <Text style={[styles.paragraph, styles.small, { marginTop: 14 }]}>
          <Runs runs={agreement.attribution} />
        </Text>

        <Divider>STANDARD TERMS</Divider>

        {agreement.clauses.map((clause, index) => (
          <View key={index} style={styles.clause}>
            <Text style={styles.clauseNumber}>{index + 1}.</Text>
            <Text style={styles.clauseBody}>
              <Runs runs={clause} />
            </Text>
          </View>
        ))}

        <Text style={styles.small}>
          <Runs runs={agreement.standardTermsFooter} />
        </Text>
      </Page>
    </Document>
  );
}

function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((run, index) =>
        run.href ? (
          <Link key={index} src={run.href} style={styles.link}>
            {run.text}
          </Link>
        ) : (
          <Text key={index} style={run.bold ? styles.bold : undefined}>
            {run.text}
          </Text>
        ),
      )}
    </>
  );
}

function Divider({ children }: { children: string }) {
  return (
    <View style={styles.divider}>
      <Text style={styles.dividerText}>{children}</Text>
    </View>
  );
}

function SignatureTable({
  rows,
  partyRoles,
}: {
  rows: SignatureRow[];
  partyRoles: [string, string];
}) {
  return (
    // Kept whole: a row split from its party header would leave someone signing
    // an unlabelled box. The table is far shorter than a page, so at worst it
    // moves down to the next one.
    <View style={styles.table} wrap={false}>
      <View
        style={[styles.row, { borderTopWidth: 1, borderTopColor: "#94a3b8" }]}
      >
        <View style={[styles.cell, styles.labelCell]}>
          <Text> </Text>
        </View>
        {partyRoles.map((party) => (
          <View key={party} style={[styles.cell, styles.partyCell]}>
            <Text style={styles.headerCell}>{party}</Text>
          </View>
        ))}
      </View>

      {rows.map(({ label, values, tall }) => (
        <View key={label} style={styles.row} wrap={false}>
          <View style={[styles.cell, styles.labelCell]}>
            <Text>{label}</Text>
          </View>
          {values.map((value, index) => (
            <View
              key={index}
              style={[
                styles.cell,
                styles.partyCell,
                { minHeight: tall ? 40 : 24 },
              ]}
            >
              <Text>{value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
