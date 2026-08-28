import type { Locale } from "#lib/locales";
import { en, type MessageKey } from "#lib/translations/en";
import { nl, nlValues } from "#lib/translations/nl";

export const messages = { en, nl } satisfies Record<Locale, Record<MessageKey, string>>;
export const localizedValues: Partial<Record<Locale, Record<string, string>>> = { nl: nlValues };
