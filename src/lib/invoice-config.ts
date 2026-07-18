// Configuration du vendeur pour les factures.
// Informations légales officielles de la SAS Break And Vap.
export const INVOICE_SELLER = {
  company: "Break And Vap",
  legal_form: "SAS à capital variable de 27 000 €",
  siret: "841 534 670 00010",
  siren: "841 534 670",
  vat_number: "FR57841534670",
  rcs: "RCS Chalon-sur-Saône 841 534 670",
  president: "Samuel Houssinger",
  address_line1: "5 Boulevard de Lattre de Tassigny",
  address_line2: "",
  postal_code: "71300",
  city: "Montceau-les-Mines",
  country: "France",
  secondary_establishment: "46 Rue Maréchal Foch, 71200 Le Creusot",
  email: "breakandvap@gmail.com",
  phone: "06 10 25 47 26",
  website: "https://breakandvap.lovable.app",
};

// Taux de TVA appliqué (produits sont TTC en base ; on décompose pour l'affichage facture).
export const INVOICE_VAT_RATE = 20; // %

export type InvoiceSeller = typeof INVOICE_SELLER;