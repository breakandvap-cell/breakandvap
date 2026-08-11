// Génération de la fiche de picking (préparation de colis) en PDF, edge-compatible.
import { PDFDocument, PDFFont, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { productRef } from "./order-item-format";

export type PickingPdfItem = {
  product_name: string;
  quantity: number;
  volume_ml?: number | null;
  nicotine_mg?: number | null;
  flavor?: string | null;
  boosters_count?: number | null;
  variant_sku?: string | null;
};

export type PickingPdfData = {
  order_number: string;
  created_at?: string | null;
  customer_name?: string | null;
  shipping_city?: string | null;
  items: PickingPdfItem[];
};

// pdf-lib (fontes standard) n'accepte pas tous les caractères Unicode.
function ascii(text: string): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "-");
}

export async function renderPickingPdf(data: PickingPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageSize: [number, number] = [595.28, 841.89];
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.1, 0.1, 0.1);
  const gray = rgb(0.42, 0.42, 0.42);
  const line = rgb(0.85, 0.85, 0.85);
  const marginX = 40;

  let page = doc.addPage(pageSize);
  const { width, height } = page.getSize();
  let y = height - 50;

  const draw = (t: string, x: number, yy: number, size = 10, f: PDFFont = font, color = black) =>
    page.drawText(ascii(t), { x, y: yy, size, font: f, color });

  const header = () => {
    y = height - 50;
    draw("FICHE DE PICKING", marginX, y, 18, bold);
    y -= 20;
    draw(`Commande ${data.order_number}`, marginX, y, 11, bold);
    y -= 14;
    const meta = [
      data.created_at ? `Date : ${new Date(data.created_at).toLocaleDateString("fr-FR")}` : null,
      data.customer_name ? `Client : ${data.customer_name}` : null,
      data.shipping_city ? `Ville : ${data.shipping_city}` : null,
    ].filter(Boolean) as string[];
    if (meta.length) {
      draw(meta.join("  -  "), marginX, y, 9, font, gray);
      y -= 14;
    }
    const totalUnits = data.items.reduce((s, i) => s + i.quantity, 0);
    draw(
      `${data.items.length} ligne(s) - ${totalUnits} article(s) a preparer`,
      marginX,
      y,
      9,
      font,
      gray,
    );
    y -= 18;
    page.drawRectangle({
      x: marginX,
      y: y - 4,
      width: width - marginX * 2,
      height: 18,
      color: rgb(0.95, 0.95, 0.95),
    });
    draw("OK", marginX + 4, y + 3, 8, bold);
    draw("Ref", marginX + 30, y + 3, 8, bold);
    draw("Produit / variante", marginX + 130, y + 3, 8, bold);
    draw("Qte", width - marginX - 30, y + 3, 8, bold);
    y -= 14;
  };

  header();

  for (const it of data.items) {
    const specs = [
      it.volume_ml ? `${it.volume_ml} ml` : null,
      it.nicotine_mg != null ? `${String(it.nicotine_mg).replace(".", ",")} mg` : null,
      it.flavor || null,
      it.boosters_count && it.boosters_count > 0 ? `+${it.boosters_count} booster(s)` : null,
    ].filter(Boolean) as string[];
    const rowHeight = specs.length ? 32 : 24;
    if (y - rowHeight < 60) {
      page = doc.addPage(pageSize);
      header();
    }
    y -= 16;
    page.drawRectangle({
      x: marginX + 3,
      y: y - 3,
      width: 12,
      height: 12,
      borderColor: rgb(0.3, 0.3, 0.3),
      borderWidth: 1,
    });
    const ref =
      (it.variant_sku && it.variant_sku.trim()) || productRef(it.product_name, it.volume_ml);
    draw(ref, marginX + 30, y, 8, bold);
    draw(it.product_name, marginX + 130, y, 10, bold);
    draw(`x${it.quantity}`, width - marginX - 32, y, 13, bold);
    if (specs.length) {
      y -= 12;
      draw(specs.join(" - "), marginX + 130, y, 8, font, gray);
    }
    y -= 8;
    page.drawLine({
      start: { x: marginX, y },
      end: { x: width - marginX, y },
      thickness: 0.3,
      color: line,
    });
  }

  const pages = doc.getPages();
  pages.forEach((p, idx) => {
    p.drawText(ascii(`Commande ${data.order_number} - Page ${idx + 1}/${pages.length}`), {
      x: marginX,
      y: 32,
      size: 8,
      font,
      color: gray,
    });
    p.drawText("Verifier les quantites avant fermeture du colis.", {
      x: width - marginX - 210,
      y: 32,
      size: 8,
      font,
      color: gray,
    });
  });

  return await doc.save();
}