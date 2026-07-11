// Génération de PDF de facture, edge-compatible via pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { INVOICE_SELLER } from "./invoice-config";
import { itemDescription, lineTaxBreakdown, productRef } from "./order-item-format";

export type InvoiceItem = {
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  base_price_cents?: number | null;
  boosters_count?: number | null;
  booster_unit_price_cents?: number | null;
  nicotine_mg?: number | null;
  volume_ml?: number | null;
  flavor?: string | null;
};

export type InvoiceBuyer = {
  full_name: string;
  email: string;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  postal_code: string;
  city: string;
  country: string;
};

export type InvoiceData = {
  number: string;
  issued_at: Date;
  order_number: string;
  currency: string;
  subtotal_cents: number;
  tax_rate: number;
  tax_cents: number;
  total_cents: number;
  buyer: InvoiceBuyer;
  items: InvoiceItem[];
};

function formatMoney(cents: number, currency: string): string {
  const amount = (cents / 100).toFixed(2).replace(".", ",");
  return `${amount} ${currency}`;
}

export async function renderInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const { width, height } = page.getSize();
  const marginX = 40;
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.4, 0.4, 0.4);
  const line = rgb(0.85, 0.85, 0.85);

  let y = height - 50;
  const draw = (text: string, x: number, yy: number, size = 10, f = font, color = black) =>
    page.drawText(text, { x, y: yy, size, font: f, color });

  // En-tête vendeur
  draw(INVOICE_SELLER.company, marginX, y, 14, bold);
  y -= 16;
  draw(INVOICE_SELLER.address_line1, marginX, y, 9, font, gray);
  y -= 12;
  if (INVOICE_SELLER.address_line2) {
    draw(INVOICE_SELLER.address_line2, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(`${INVOICE_SELLER.postal_code} ${INVOICE_SELLER.city}, ${INVOICE_SELLER.country}`, marginX, y, 9, font, gray);
  y -= 12;
  draw(`SIRET : ${INVOICE_SELLER.siret}`, marginX, y, 9, font, gray);
  y -= 12;
  draw(`N° TVA : ${INVOICE_SELLER.vat_number}`, marginX, y, 9, font, gray);
  y -= 12;
  if (INVOICE_SELLER.email) {
    draw(INVOICE_SELLER.email, marginX, y, 9, font, gray);
    y -= 12;
  }

  // Titre + numéro facture (à droite)
  draw("FACTURE", width - marginX - 130, height - 55, 20, bold);
  draw(`N° ${data.number}`, width - marginX - 130, height - 78, 11, bold);
  draw(
    `Date : ${data.issued_at.toLocaleDateString("fr-FR")}`,
    width - marginX - 130,
    height - 94,
    9,
    font,
    gray,
  );
  draw(
    `Commande : ${data.order_number}`,
    width - marginX - 130,
    height - 108,
    9,
    font,
    gray,
  );

  // Séparateur
  y -= 10;
  page.drawLine({
    start: { x: marginX, y },
    end: { x: width - marginX, y },
    thickness: 0.5,
    color: line,
  });

  // Bloc acheteur
  y -= 20;
  draw("Facturé à", marginX, y, 10, bold);
  y -= 14;
  draw(data.buyer.full_name, marginX, y, 10);
  y -= 12;
  draw(data.buyer.email, marginX, y, 9, font, gray);
  y -= 12;
  if (data.buyer.phone) {
    draw(data.buyer.phone, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(data.buyer.line1, marginX, y, 9, font, gray);
  y -= 12;
  if (data.buyer.line2) {
    draw(data.buyer.line2, marginX, y, 9, font, gray);
    y -= 12;
  }
  draw(
    `${data.buyer.postal_code} ${data.buyer.city}, ${data.buyer.country}`,
    marginX,
    y,
    9,
    font,
    gray,
  );

  // Tableau articles (colonnes façon facture pro)
  y -= 30;
  const tableRight = width - marginX;
  // Positions X : Réf | Description | PU TTC | Qté | HT | TVA | TTC
  const col = {
    ref: marginX + 2,
    desc: marginX + 62,
    pu: tableRight - 220,
    qty: tableRight - 165,
    ht: tableRight - 130,
    tva: tableRight - 70,
    ttc: tableRight - 4,
  };
  page.drawRectangle({
    x: marginX,
    y: y - 4,
    width: width - marginX * 2,
    height: 18,
    color: rgb(0.95, 0.95, 0.95),
  });
  const drawRight = (text: string, xRight: number, yy: number, size = 8, f = font, color = black) => {
    const w = f.widthOfTextAtSize(text, size);
    page.drawText(text, { x: xRight - w, y: yy, size, font: f, color });
  };
  draw("Réf", col.ref, y + 4, 8, bold);
  draw("Description", col.desc, y + 4, 8, bold);
  drawRight("PU TTC", col.pu, y + 4, 8, bold);
  drawRight("Qté", col.qty, y + 4, 8, bold);
  drawRight("HT", col.ht, y + 4, 8, bold);
  drawRight("TVA", col.tva, y + 4, 8, bold);
  drawRight("TTC", col.ttc, y + 4, 8, bold);
  y -= 10;

  const descMaxChars = 46;
  const totals = { ht: 0, tva: 0, ttc: 0 };
  for (const it of data.items) {
    y -= 14;
    const ref = productRef(it.product_name, it.volume_ml);
    let desc = itemDescription(it);
    if (desc.length > descMaxChars) desc = desc.slice(0, descMaxChars - 1) + "…";
    const b = lineTaxBreakdown(it.unit_price_cents, it.quantity, data.tax_rate);
    totals.ht += b.ht;
    totals.tva += b.tva;
    totals.ttc += b.ttc;

    draw(ref, col.ref, y, 8, bold);
    draw(desc, col.desc, y, 9);
    drawRight(formatMoney(it.unit_price_cents, data.currency), col.pu, y, 9);
    drawRight(String(it.quantity), col.qty, y, 9);
    drawRight(formatMoney(b.ht, data.currency), col.ht, y, 9);
    drawRight(formatMoney(b.tva, data.currency), col.tva, y, 9);
    drawRight(formatMoney(b.ttc, data.currency), col.ttc, y, 9);

    if (
      it.boosters_count &&
      it.boosters_count > 0 &&
      it.booster_unit_price_cents != null &&
      it.base_price_cents != null
    ) {
      y -= 10;
      const detail = `dont flacon ${formatMoney(it.base_price_cents, data.currency)} + ${it.boosters_count} booster${it.boosters_count > 1 ? "s" : ""} × ${formatMoney(it.booster_unit_price_cents, data.currency)}`;
      draw(detail, col.desc, y, 7, font, gray);
    }
    page.drawLine({
      start: { x: marginX, y: y - 4 },
      end: { x: tableRight, y: y - 4 },
      thickness: 0.3,
      color: line,
    });
  }

  // Totaux (utilise la somme des lignes, cohérente avec l'affichage détaillé)
  y -= 24;
  const labelRight = tableRight - 90;
  const valRight = tableRight - 4;
  draw("Sous-total HT", labelRight - 60, y, 9);
  drawRight(formatMoney(totals.ht, data.currency), valRight, y, 9);
  y -= 13;
  draw(`TVA (${data.tax_rate.toFixed(2).replace(".", ",")} %)`, labelRight - 60, y, 9);
  drawRight(formatMoney(totals.tva, data.currency), valRight, y, 9);
  y -= 6;
  page.drawLine({
    start: { x: labelRight - 60, y },
    end: { x: valRight, y },
    thickness: 0.5,
    color: line,
  });
  y -= 14;
  draw("Total TTC", labelRight - 60, y, 11, bold);
  drawRight(formatMoney(data.total_cents, data.currency), valRight, y, 11, bold);

  // Mentions légales bas de page
  const footerY = 60;
  draw(
    "TVA acquittée selon les débits. Pas d'escompte pour paiement anticipé.",
    marginX,
    footerY + 14,
    8,
    font,
    gray,
  );
  draw(
    `En cas de retard de paiement, indemnité forfaitaire de 40 € (art. L441-10 C. com.).`,
    marginX,
    footerY,
    8,
    font,
    gray,
  );
  draw(
    `${INVOICE_SELLER.company} · SIRET ${INVOICE_SELLER.siret} · TVA ${INVOICE_SELLER.vat_number}`,
    marginX,
    footerY - 14,
    8,
    font,
    gray,
  );

  return await doc.save();
}
