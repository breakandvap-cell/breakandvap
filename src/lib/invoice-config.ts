// Configuration du vendeur pour les factures.
// À COMPLÉTER avec les vraies informations légales de la société.
export const INVOICE_SELLER = {
  company: "SAS Break and Vap",
  legal_form: "SAS au capital de X €",
  siret: "À COMPLÉTER (14 chiffres)",
  vat_number: "FR XX XXXXXXXXX",
  rcs: "RCS Dijon",
  address_line1: "À COMPLÉTER — rue et numéro",
  address_line2: "",
  postal_code: "21000",
  city: "Dijon",
  country: "France",
  email: "contact@breakandvap.fr",
  phone: "",
  website: "https://breakandvap.lovable.app",
};

// Taux de TVA appliqué (produits sont TTC en base ; on décompose pour l'affichage facture).
export const INVOICE_VAT_RATE = 20; // %

export type InvoiceSeller = typeof INVOICE_SELLER;
