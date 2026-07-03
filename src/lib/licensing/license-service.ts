// Seam for the future freemium "Pro" tier. In the MVP everything is free, so
// isPro() is always false. Pro-gated features (editor, watermarks, smart PDF
// page breaks) will check this. When monetization lands, swap the
// implementation (e.g. ExtensionPay or a Stripe-backed license validator)
// without touching call sites.

export interface LicenseService {
  isPro(): Promise<boolean>;
}

export const licenseService: LicenseService = {
  async isPro(): Promise<boolean> {
    return false;
  },
};
