/**
 * Terms of Use and Privacy Policy, as data, rendered by src/ui/legal-document.tsx.
 *
 * Fill in LEGAL_DETAILS before launch. Any value left null shows as a highlighted [PLACEHOLDER] on the
 * page, and the page keeps its "Draft · needs legal review" tag until `reviewed` is set to true.
 * Have a lawyer review both documents before setting it.
 */
export const LEGAL_DETAILS = {
  // Set to true by the owner on 2026-11-06 (no lawyer review yet). Get both documents reviewed
  // before a wider launch.
  reviewed: true,
  /** Who runs Atrazo: your name or business name. */
  operator: "Renzo Feliciano Payod" as string | null,
  /** Address for terms and privacy questions (the Data Protection Officer contact). */
  contactEmail: "renzofelicianopayod.personal@gmail.com" as string | null,
  /** Set on launch day, e.g. "1 December 2026". */
  effectiveDate: "7 November 2026" as string | null,
  /** Days to remove a deleted store's backups. */
  deleteDays: "30" as string | null,
  /** Days before backups of a store no phone has opened are removed. */
  orphanDays: "365" as string | null,
  /** Neon region, e.g. "Singapore (AWS ap-southeast-1)". */
  databaseRegion: "Singapore (AWS ap-southeast-1)" as string | null,
};

export type LegalToken = Exclude<keyof typeof LEGAL_DETAILS, "reviewed">;

export const PLACEHOLDER_LABEL: Record<LegalToken, string> = {
  operator: "OPERATOR NAME",
  contactEmail: "CONTACT EMAIL",
  effectiveDate: "DATE",
  deleteDays: "NUMBER",
  orphanDays: "NUMBER",
  databaseRegion: "DATABASE REGION",
};

/** Text may contain {token} references to LEGAL_DETAILS. */
export type LegalBlock = { readonly p: string } | { readonly ul: readonly string[] };

export interface LegalSection {
  readonly title: string;
  readonly blocks: readonly LegalBlock[];
}

export interface LegalPoint {
  readonly icon: "check" | "key" | "file" | "scale" | "lock" | "eyeOff" | "cloud" | "trash";
  readonly title: string;
  readonly text: string;
}

export interface LegalDocument {
  readonly kind: "terms" | "privacy";
  readonly title: string;
  readonly subtitle: string;
  readonly points: readonly LegalPoint[];
  readonly sections: readonly LegalSection[];
}

export const TERMS: LegalDocument = {
  kind: "terms",
  title: "Terms of Use",
  subtitle: "How Atrazo works, and what you agree to",
  points: [
    { icon: "check", title: "Free, no sign-up", text: "Your recovery code is your account." },
    {
      icon: "key",
      title: "Guard your code",
      text: "Lose every phone and the code, and no one can recover your records.",
    },
    {
      icon: "file",
      title: "Your records are yours",
      text: "Keep them accurate, with the permission of the people you record.",
    },
    {
      icon: "scale",
      title: "Philippine law",
      text: "These terms follow the laws of the Philippines.",
    },
  ],
  sections: [
    {
      title: "Who runs Atrazo",
      blocks: [
        {
          p: "Atrazo is an utang ledger run by {operator}. It is for anyone who keeps a record of what other people owe them: a sari-sari store or small business that gives credit to customers, or a person who lends money or goods to relatives, friends, neighbours or co-workers.",
        },
        {
          p: "In the app and in these terms, your “store” is your ledger, even if you don’t run a shop, and your “clients” are the people you record as owing you.",
        },
        {
          p: "These terms are an agreement between you, the person using Atrazo, and {operator}. By opening a store in Atrazo, you accept them.",
        },
      ],
    },
    {
      title: "The service is free",
      blocks: [
        {
          p: "Atrazo is offered at no cost. There are no fees, subscriptions or charges for recording entries, backups, or using Atrazo on more than one phone.",
        },
        {
          p: "If this ever changes, we will tell you in the app before anything is charged, and you can export your records first.",
        },
      ],
    },
    {
      title: "Your store and its recovery code",
      blocks: [
        {
          p: "There is no sign-up. When you open a store, your phone creates a recovery code. That code is your account: it is the only way to open your store on another phone.",
        },
        {
          ul: [
            "Keep your recovery code safe, on paper, somewhere other than where you keep your phone. Anyone who has it can open your store.",
            "We never see your recovery code and cannot reset it or look it up for you.",
            "If you lose every phone with your store and also lose the recovery code, your records cannot be recovered by anyone, including us.",
            "If you still have a phone with your store, you can make a new recovery code in Settings at any time.",
          ],
        },
      ],
    },
    {
      title: "Your records are yours",
      blocks: [
        {
          p: "The clients, entries, amounts and notes you write belong to you. We do not claim ownership of them.",
        },
        {
          ul: [
            "You are responsible for keeping your records accurate.",
            "You are responsible for having your clients’ permission to record their names, phone numbers and balances.",
            "You can export everything as a CSV file at any time from Settings.",
          ],
        },
      ],
    },
    {
      title: "Acceptable use",
      blocks: [
        {
          p: "Use Atrazo only to keep track of what people owe you, whether that is utang at your store or money and goods you lent. Do not use it to:",
        },
        {
          ul: [
            "harass, shame or threaten anyone, including by publishing a client’s balance;",
            "record information you have no right to keep;",
            "break the law, or try to access another person’s store or our systems.",
          ],
        },
        {
          p: "Atrazo only keeps records. It does not lend money, collect payments, charge interest, or contact the people you record on your behalf, and it is not a lending or financing company. If you lend money as a business, you are responsible for the registrations and rules that apply to you.",
        },
      ],
    },
    {
      title: "Offline use and backups",
      blocks: [
        {
          p: "Atrazo saves every entry on your phone first, so it works without signal. When your phone is online, entries are encrypted on the phone and backed up.",
        },
        {
          p: "Entries that are not yet backed up exist only on that phone. If the phone is lost, broken or wiped before it reconnects, those entries can be lost. The app shows how many entries are waiting to back up.",
        },
        {
          p: "We work to keep backups safe, but we cannot guarantee that no data will ever be lost.",
        },
      ],
    },
    {
      title: "Availability and changes",
      blocks: [
        {
          p: "Atrazo runs on free hosting and database plans. It may be slow, paused, or unavailable at times, and features may change or be removed.",
        },
        {
          p: "Because entries are saved on your phone first, you can usually keep recording even when the service is down.",
        },
      ],
    },
    {
      title: "Ending use and deleting your store",
      blocks: [
        {
          p: "You can stop using Atrazo at any time. You can delete your store from Settings; this removes your encrypted backups from our servers as described in the Privacy Policy.",
        },
        {
          p: "We may remove stores that break these terms or abuse the service. Because we cannot read your records or contact you, we cannot always warn you first, so export your records regularly.",
        },
      ],
    },
    {
      title: "Limitation of liability",
      blocks: [
        {
          p: "Atrazo is provided “as is”. To the extent the law allows, {operator} is not liable for lost profits, unpaid debts, lost data, a lost recovery code, or disputes between you and your clients arising from your use of Atrazo.",
        },
        {
          p: "Nothing in these terms limits rights you have under Philippine law that cannot be waived.",
        },
      ],
    },
    {
      title: "Changes to these terms",
      blocks: [
        {
          p: "We may update these terms. When we make a significant change, we will show a notice in the app before it takes effect. Continuing to use Atrazo after that means you accept the new terms.",
        },
      ],
    },
    {
      title: "Governing law and contact",
      blocks: [
        { p: "These terms are governed by the laws of the Republic of the Philippines." },
        { p: "Questions about these terms: {contactEmail}." },
      ],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  kind: "privacy",
  title: "Privacy Policy",
  subtitle: "What we keep, and what we can’t see",
  points: [
    { icon: "lock", title: "Encrypted on your phone", text: "We cannot read your records." },
    { icon: "eyeOff", title: "No tracking, no ads", text: "No sign-up, no email, no analytics." },
    {
      icon: "cloud",
      title: "We keep very little",
      text: "A random store ID, phone names, and encrypted backups.",
    },
    {
      icon: "trash",
      title: "Delete any time",
      text: "Backups are removed within {deleteDays} days.",
    },
  ],
  sections: [
    {
      title: "What we collect",
      blocks: [
        {
          p: "Nothing that identifies you. There is no sign-up, so we never ask for your name, email address or phone number. Our servers keep only:",
        },
        {
          ul: [
            "a random store ID, created by your phone;",
            "a one-way fingerprint of your recovery code, so a new phone can prove it has the code (the code itself cannot be worked out from it);",
            "your encryption key, locked with your recovery code, so we cannot use it;",
            "your phones’ names and when each was last seen, for the Phones with your store list;",
            "your records, encrypted on your phone before they are sent. We cannot read client names, phone numbers, amounts or notes.",
          ],
        },
        { p: "We do not collect your location, contacts, or anything you do outside Atrazo." },
      ],
    },
    {
      title: "No tracking",
      blocks: [
        {
          ul: [
            "No analytics, no tracking, and no ads.",
            "No third-party scripts, pixels or tracking cookies.",
            "Fonts and icons are bundled with the app, so opening Atrazo does not contact any other company.",
          ],
        },
      ],
    },
    {
      title: "Where it’s stored",
      blocks: [
        {
          ul: [
            "On your phone, in the browser’s storage, so Atrazo works offline. This copy is readable on your phone only.",
            "Encrypted backups, in a Neon Postgres database located in {databaseRegion}.",
            "The app itself is hosted on Vercel. Like any web host, Vercel keeps short-lived request logs that include IP addresses.",
          ],
        },
      ],
    },
    {
      title: "Why we use it",
      blocks: [
        {
          p: "Only to run your ledger: to back up your encrypted records and restore them on a phone that has your recovery code. We do not use anything for advertising or profiling, and we cannot, because we cannot read your records.",
        },
      ],
    },
    {
      title: "Who we share it with",
      blocks: [
        {
          p: "We do not sell data and we do not show ads. We use only these service providers to run Atrazo:",
        },
        { ul: ["Vercel, to host the app;", "Neon, to store your encrypted backups."] },
        {
          p: "If the law requires us to hand over data, we can only provide what we hold: a store ID, phone names, timestamps and encrypted records we cannot read.",
        },
      ],
    },
    {
      title: "Information about the people you record",
      blocks: [
        {
          p: "Your records include personal information about the people you record: your store’s customers, or the relatives, friends and others who owe you. Under the Data Privacy Act of 2012 (Republic Act No. 10173), you are responsible for how you collect and use their information. Atrazo stores it only in encrypted form that we cannot read.",
        },
        {
          p: "Ask people before recording their phone numbers, and only record what you need to keep track of what they owe.",
        },
      ],
    },
    {
      title: "Keeping and deleting data",
      blocks: [
        {
          p: "We keep your encrypted backups for as long as your store exists. If you choose Delete store in Settings, all of its backups and phone records are removed from our servers within {deleteDays} days.",
        },
        {
          p: "Signing out of a phone erases the Atrazo copy on that phone. Signing out a lost phone from Settings erases it the next time it connects.",
        },
        {
          p: "If you lose every phone with your store and your recovery code, no one can open the backups. They are removed after {orphanDays} days without any phone connecting.",
        },
      ],
    },
    {
      title: "Security",
      blocks: [
        {
          ul: [
            "Records are encrypted on your phone (AES-256) before they leave it, and every connection is encrypted too.",
            "Only a phone with your recovery code can open your store’s backups.",
            "You can see every phone that has your store, sign out any of them, and make a new recovery code.",
          ],
        },
      ],
    },
    {
      title: "Your rights",
      blocks: [
        { p: "Under the Data Privacy Act, you have the right to:" },
        {
          ul: [
            "access the data we hold about your store;",
            "correct your records, directly in the app;",
            "have it erased, by deleting your store;",
            "take a copy with you, using CSV export in Settings;",
            "file a complaint with the National Privacy Commission.",
          ],
        },
      ],
    },
    {
      title: "Changes to this policy",
      blocks: [
        {
          p: "When we make a significant change to this policy, we will show a notice in the app before it takes effect.",
        },
      ],
    },
    {
      title: "Contact and Data Protection Officer",
      blocks: [
        {
          p: "For privacy questions or requests, contact our Data Protection Officer at {contactEmail}. Because we don’t know who you are, include your store ID from Settings so we can find your store.",
        },
      ],
    },
  ],
};
