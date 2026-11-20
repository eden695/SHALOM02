// Phone Contact Directory & vCard (.vcf) Import Helper for SHALOM
// Strictly uses Web Contact Picker API: navigator.contacts.select(['name', 'tel'], { multiple: true })
import { dbService, STORES } from './db';
import { Contact } from '../types';

export interface PickContactsResult {
  status: 'success' | 'cancelled' | 'unsupported' | 'insecure_context' | 'iframe_blocked' | 'error';
  contacts: Contact[];
  addedCount: number;
  duplicateCount?: number;
  message?: string;
}

export const normalizePhone = (phone: string): string => {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  // Normalize leading 00 international prefix to +
  return cleaned.startsWith('00') ? `+${cleaned.slice(2)}` : cleaned;
};

export function isHttpsOrLocalhost(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext ||
    window.location.protocol === 'https:' ||
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

export function isNativeContactPickerSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as unknown as {
    contacts?: { select?: unknown };
  };
  return Boolean(nav.contacts && typeof nav.contacts.select === 'function');
}

export async function pickContactsFromDevice(
  existingContacts: Contact[],
  options?: { multiple?: boolean }
): Promise<PickContactsResult> {
  if (!isHttpsOrLocalhost()) {
    return {
      status: 'insecure_context',
      contacts: [],
      addedCount: 0,
      message:
        'Le sélecteur de contacts Android exige une connexion sécurisée HTTPS. Ouvrez l’application en HTTPS ou ajoutez vos contacts manuellement.',
    };
  }

  const nav = navigator as unknown as {
    contacts?: {
      select: (
        props: Array<'name' | 'tel'>,
        opts: { multiple: boolean }
      ) => Promise<Array<{ name?: string[]; tel?: string[] }>>;
    };
  };

  if (!nav.contacts || typeof nav.contacts.select !== 'function') {
    return {
      status: 'unsupported',
      contacts: [],
      addedCount: 0,
      message:
        'L’API Web Contact Picker (navigator.contacts) n’est pas prise en charge dans ce navigateur ou WebView Android. Vous pouvez ajouter vos contacts manuellement ou importer un fichier .vcf.',
    };
  }

  try {
    // Strictly request ['name', 'tel'] with multiple: true (or specified option)
    const picked = await nav.contacts.select(['name', 'tel'], {
      multiple: options?.multiple ?? true,
    });

    if (!picked || picked.length === 0) {
      return {
        status: 'cancelled',
        contacts: [],
        addedCount: 0,
        message: 'Aucun contact sélectionné.',
      };
    }

    const existingByPhone = new Map<string, Contact>();
    existingContacts.forEach((c) => {
      const norm = normalizePhone(c.phone);
      if (norm) existingByPhone.set(norm, c);
    });

    const selectedOrCreated: Contact[] = [];
    let addedCount = 0;
    let duplicateCount = 0;

    for (let i = 0; i < picked.length; i++) {
      const p = picked[i];
      const telList = (p.tel || []).map((t) => t.trim()).filter(Boolean);
      if (telList.length === 0) continue;

      const rawName = (p.name?.[0] || 'Contact').trim();
      const parts = rawName.split(/\s+/);
      const firstName = parts[0] || rawName;
      const lastName = parts.slice(1).join(' ');

      // Handle one or multiple phone numbers returned for the selected contact
      for (let j = 0; j < telList.length; j++) {
        const rawPhone = telList[j];
        const norm = normalizePhone(rawPhone);
        if (!norm) continue;

        const already = existingByPhone.get(norm);
        if (already) {
          duplicateCount++;
          if (!selectedOrCreated.some((c) => c.id === already.id)) {
            selectedOrCreated.push(already);
          }
          continue;
        }

        const newContact: Contact = {
          id: `c_tel_${Date.now()}_${i}_${j}`,
          firstName,
          lastName: telList.length > 1 && j > 0 ? `${lastName} (${j + 1})`.trim() : lastName,
          phone: rawPhone,
          category: 'personnel',
          createdAt: new Date().toISOString(),
        };

        await dbService.put(STORES.CONTACTS, newContact);
        existingByPhone.set(norm, newContact);
        selectedOrCreated.push(newContact);
        addedCount++;
      }
    }

    let message = '';
    if (addedCount > 0 && duplicateCount > 0) {
      message = `${addedCount} nouveau(x) contact(s) ajouté(s) depuis votre téléphone (${duplicateCount} doublon(s) ignoré(s)).`;
    } else if (addedCount > 0) {
      message = `${addedCount} contact(s) importé(s) depuis votre téléphone.`;
    } else if (duplicateCount > 0) {
      message = `Tous les numéros sélectionnés (${duplicateCount}) existent déjà dans votre répertoire SHALOM.`;
    } else {
      message = 'Aucun numéro de téléphone valide trouvé dans les contacts sélectionnés.';
    }

    return {
      status: 'success',
      contacts: selectedOrCreated,
      addedCount,
      duplicateCount,
      message,
    };
  } catch (err: unknown) {
    const errName = err instanceof DOMException ? err.name : '';
    const errMsg = err instanceof Error ? err.message : '';
    if (
      errName === 'SecurityError' ||
      errMsg.toLowerCase().includes('top-level') ||
      errMsg.toLowerCase().includes('iframe')
    ) {
      return {
        status: 'iframe_blocked',
        contacts: [],
        addedCount: 0,
        message:
          'L’accès au répertoire téléphone nécessite l’ouverture en fenêtre principale HTTPS (bloqué dans une iframe). Ajoutez un contact manuellement ou ouvrez l’application directement.',
      };
    }
    if (errName === 'AbortError') {
      return {
        status: 'cancelled',
        contacts: [],
        addedCount: 0,
        message: 'Sélection annulée par l’utilisateur.',
      };
    }
    return {
      status: 'error',
      contacts: [],
      addedCount: 0,
      message: errMsg
        ? `Erreur lors de l’accès au répertoire : ${errMsg}`
        : 'Impossible d’ouvrir le sélecteur de contacts sur cet appareil.',
    };
  }
}

export async function importContactsFromVcfOrCsv(
  file: File,
  existingContacts: Contact[]
): Promise<{ contacts: Contact[]; addedCount: number }> {
  const text = await file.text();
  if (!text) return { contacts: [], addedCount: 0 };

  const existingByPhone = new Map<string, Contact>();
  existingContacts.forEach((c) => {
    const norm = normalizePhone(c.phone);
    if (norm) existingByPhone.set(norm, c);
  });

  const importedContacts: Contact[] = [];
  let addedCount = 0;

  if (file.name.toLowerCase().endsWith('.vcf') || text.includes('BEGIN:VCARD')) {
    const cards = text.split(/BEGIN:VCARD/i).slice(1);
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const fnMatch = card.match(/^FN(?:;[^:]*)?:(.+)$/im);
      const nMatch = card.match(/^N(?:;[^:]*)?:([^;\r\n]*);?([^;\r\n]*)/im);
      const telMatches = Array.from(card.matchAll(/^TEL(?:;[^:]*)?:(.+)$/gim));
      const emailMatch = card.match(/^EMAIL(?:;[^:]*)?:(.+)$/im);

      const fallbackName = nMatch
        ? `${nMatch[2]?.trim() || ''} ${nMatch[1]?.trim() || ''}`.trim()
        : '';
      const fullName = (fnMatch?.[1]?.trim() || fallbackName || 'Contact').replace(/\r/g, '');
      const rawPhone = (telMatches[0]?.[1]?.trim() || '').replace(/\r/g, '');

      if (!rawPhone) continue;

      const norm = normalizePhone(rawPhone);
      const already = existingByPhone.get(norm);
      if (already) {
        importedContacts.push(already);
        continue;
      }

      const nameParts = fullName.split(/\s+/);
      const newContact: Contact = {
        id: `c_vcf_${Date.now()}_${i}`,
        firstName: nameParts[0] || fullName,
        lastName: nameParts.slice(1).join(' '),
        phone: rawPhone,
        email: emailMatch?.[1]?.trim().replace(/\r/g, '') || undefined,
        category: 'personnel',
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.CONTACTS, newContact);
      existingByPhone.set(norm, newContact);
      importedContacts.push(newContact);
      addedCount++;
    }
  } else {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(',').map((s) => s.replace(/(^"|"$)/g, '').trim());
      if (parts.length >= 3 && parts[0] && parts[2]) {
        const norm = normalizePhone(parts[2]);
        const already = existingByPhone.get(norm);
        if (already) {
          importedContacts.push(already);
          continue;
        }
        const newContact: Contact = {
          id: `c_imp_${Date.now()}_${i}`,
          firstName: parts[0],
          lastName: parts[1] || '',
          phone: parts[2],
          email: parts[3] || undefined,
          category: (parts[4] as Contact['category']) || 'personnel',
          neighborhood: parts[5] || undefined,
          address: parts[6] || undefined,
          notes: parts[7] || undefined,
          createdAt: new Date().toISOString(),
        };
        await dbService.put(STORES.CONTACTS, newContact);
        existingByPhone.set(norm, newContact);
        importedContacts.push(newContact);
        addedCount++;
      }
    }
  }

  return { contacts: importedContacts, addedCount };
}
