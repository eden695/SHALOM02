import React, { useState, useRef } from 'react';
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  Download,
  Upload,
  Trash2,
  Edit2,
  MessageSquare,
  CheckSquare,
  Square,
  Send,
  MapPin,
  Info,
  Camera,
  Image as ImageIcon,
  X,
} from 'lucide-react';
import { dbService, STORES } from '../../services/db';
import { importContactsFromVcfOrCsv } from '../../services/phoneContacts';
import { useShalomDB } from '../../hooks/useShalomDB';
import { Contact, ContactCategory } from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';

interface ContactsModuleProps {
  onStartCampaignWithContacts?: (contacts: Contact[]) => void;
}

function resizeContactPhotoToDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        const minSide = Math.min(img.width, img.height);
        const sx = (img.width - minSide) / 2;
        const sy = (img.height - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => resolve(null);
      if (typeof reader.result === 'string') {
        img.src = reader.result;
      } else {
        resolve(null);
      }
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export const ContactsModule: React.FC<ContactsModuleProps> = ({ onStartCampaignWithContacts }) => {
  const { contacts, reloadData } = useShalomDB();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    avatarDataUrl?: string;
    category: ContactCategory;
    notes: string;
    address: string;
    neighborhood: string;
  }>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    avatarDataUrl: undefined,
    category: 'frere_soeur',
    notes: '',
    address: '',
    neighborhood: '',
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false);

  const vcfImportRef = useRef<HTMLInputElement | null>(null);

  const CATEGORIES: { id: ContactCategory; label: string }[] = [
    { id: 'famille', label: 'Famille' },
    { id: 'ami', label: 'Ami(e)' },
    { id: 'frere_soeur', label: 'Frère / Sœur en Christ' },
    { id: 'intercesseur', label: 'Partenaire de prière' },
    { id: 'pasteur', label: 'Pasteur / Conseiller' },
    { id: 'personnel', label: 'Personnel' },
    { id: 'autre', label: 'Autre' },
  ];

  const getCategoryLabel = (cat: string) =>
    CATEGORIES.find((c) => c.id === cat)?.label || cat;

  const filteredContacts = contacts.filter((c) => {
    const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
    const matchesSearch =
      fullName.includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      (c.neighborhood && c.neighborhood.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (c.email && c.email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || c.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const handleSelectAll = () => {
    if (selectedContactIds.length === filteredContacts.length) {
      setSelectedContactIds([]);
    } else {
      setSelectedContactIds(filteredContacts.map((c) => c.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedContactIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleOpenAdd = () => {
    setEditingContact(null);
    setForm({
      firstName: '',
      lastName: '',
      phone: '',
      email: '',
      avatarDataUrl: undefined,
      category: 'frere_soeur',
      notes: '',
      address: '',
      neighborhood: '',
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (c: Contact) => {
    setEditingContact(c);
    setForm({
      firstName: c.firstName,
      lastName: c.lastName,
      phone: c.phone,
      email: c.email || '',
      avatarDataUrl: c.avatarDataUrl,
      category: c.category,
      notes: c.notes || '',
      address: c.address || '',
      neighborhood: c.neighborhood || '',
    });
    setIsModalOpen(true);
  };

  const handleContactPhotoPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await resizeContactPhotoToDataUrl(file);
    if (dataUrl) {
      setForm((prev) => ({ ...prev, avatarDataUrl: dataUrl }));
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName.trim() || !form.phone.trim()) return;

    const contactToSave: Contact = {
      id: editingContact ? editingContact.id : `c_${Date.now()}`,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      avatarDataUrl: form.avatarDataUrl || undefined,
      category: form.category,
      notes: form.notes.trim() || undefined,
      address: form.address.trim() || undefined,
      neighborhood: form.neighborhood.trim() || undefined,
      createdAt: editingContact ? editingContact.createdAt : new Date().toISOString(),
    };

    await dbService.put(STORES.CONTACTS, contactToSave);
    setIsModalOpen(false);
    reloadData();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    await dbService.deleteItem(STORES.CONTACTS, deletingId);
    setSelectedContactIds((prev) => prev.filter((id) => id !== deletingId));
    setDeletingId(null);
    reloadData();
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedContactIds.length === 0) return;
    const count = selectedContactIds.length;
    await dbService.deleteItems(STORES.CONTACTS, selectedContactIds);
    setSelectedContactIds([]);
    setIsBulkDeleteOpen(false);
    setStatusMessage(`${count} contact(s) supprimé(s).`);
    reloadData();
  };

  const executeExportCSV = () => {
    const headers = ['Prénom', 'Nom', 'Téléphone', 'Email', 'Relation', 'Quartier', 'Adresse', 'Notes'];
    const rows = contacts.map((c) => [
      `"${c.firstName}"`,
      `"${c.lastName}"`,
      `"${c.phone}"`,
      `"${c.email || ''}"`,
      `"${c.category}"`,
      `"${c.neighborhood || ''}"`,
      `"${c.address || ''}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `contacts_shalom_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportConfirmOpen(false);
    setStatusMessage(`${contacts.length} contact(s) exporté(s) au format CSV.`);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const { contacts: importedContacts, addedCount } = await importContactsFromVcfOrCsv(file, contacts);
    if (importedContacts.length > 0) {
      setStatusMessage(
        `${addedCount} nouveau(x) contact(s) importé(s) (${importedContacts.length} traité(s)).`
      );
      setIsModalOpen(false);
      reloadData();
    } else {
      setStatusMessage('Aucun contact valide trouvé dans ce fichier.');
    }
    e.target.value = '';
  };

  const handleLaunchCampaign = () => {
    const targetContacts =
      selectedContactIds.length > 0
        ? contacts.filter((c) => selectedContactIds.includes(c.id))
        : filteredContacts;

    if (onStartCampaignWithContacts) {
      onStartCampaignWithContacts(targetContacts);
    }
  };

  const formInitials = `${form.firstName.trim().charAt(0)}${form.lastName.trim().charAt(0)}`.toUpperCase() || '?';

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2 font-display">
            <Users className="w-6 h-6 text-blue-700 dark:text-blue-400" />
            <span>Mes Contacts</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Vos proches, frères et sœurs et partenaires de prière sur cet appareil
          </p>
        </div>

        {contacts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setIsExportConfirmOpen(true)}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Nouveau contact</span>
            </button>
          </div>
        )}
      </div>

      <input
        ref={vcfImportRef}
        type="file"
        accept=".csv,.vcf,text/vcard"
        onChange={handleImportFile}
        className="hidden"
      />

      {statusMessage && (
        <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0" />
            <span>{statusMessage}</span>
          </span>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="font-bold underline shrink-0"
          >
            Fermer
          </button>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200/80 dark:border-slate-800/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Rechercher par nom, téléphone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200"
            >
              <option value="all">Tous ({contacts.length})</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {selectedContactIds.length === filteredContacts.length && filteredContacts.length > 0 ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Tout sélectionner ({selectedContactIds.length})</span>
            </button>

            {selectedContactIds.length > 0 && (
              <button
                type="button"
                onClick={() => setIsBulkDeleteOpen(true)}
                className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Supprimer ({selectedContactIds.length})</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleLaunchCampaign}
              disabled={filteredContacts.length === 0}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                Partager WhatsApp/SMS{' '}
                {selectedContactIds.length > 0 ? `(${selectedContactIds.length})` : `(Tous)`}
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
        {filteredContacts.map((contact) => {
          const isSelected = selectedContactIds.includes(contact.id);
          const initials = `${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`.toUpperCase() || '?';
          return (
            <div
              key={contact.id}
              className={`p-4 rounded-2xl bg-white dark:bg-[#0c1631] border transition shadow-xs flex flex-col justify-between space-y-3 ${
                isSelected
                  ? 'border-blue-600 ring-2 ring-blue-600/20'
                  : 'border-slate-200/80 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleToggleSelect(contact.id)}
                      className="text-slate-400 hover:text-blue-600"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                    <span className="font-bold text-blue-700 dark:text-blue-400">
                      {getCategoryLabel(contact.category)}
                    </span>
                  </div>
                  {contact.neighborhood && (
                    <span className="text-slate-400 flex items-center gap-1 truncate max-w-[130px]">
                      <MapPin className="w-3 h-3 shrink-0" />
                      <span className="truncate">{contact.neighborhood}</span>
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-blue-700 dark:text-blue-300 shrink-0">
                    {contact.avatarDataUrl ? (
                      <img
                        src={contact.avatarDataUrl}
                        alt={`${contact.firstName} ${contact.lastName}`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{initials}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {contact.firstName} {contact.lastName}
                    </h3>
                    <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mt-1">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <a href={`tel:${contact.phone}`} className="hover:underline font-mono truncate">
                          {contact.phone}
                        </a>
                      </div>
                      {contact.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </div>
                      )}
                      {contact.notes && (
                        <p className="text-[11px] text-slate-500 italic line-clamp-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                          {contact.notes}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (onStartCampaignWithContacts) {
                      onStartCampaignWithContacts([contact]);
                    }
                  }}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>Écrire un message</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(contact)}
                    aria-label="Modifier le contact"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(contact.id)}
                    aria-label="Supprimer le contact"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {filteredContacts.length === 0 && (
          <div className="col-span-full py-12 px-4 text-center rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 space-y-3">
            <Users className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {contacts.length === 0
                ? 'Votre répertoire est vide pour le moment.'
                : 'Aucun contact ne correspond à votre recherche.'}
            </p>
            {contacts.length === 0 && (
              <button
                type="button"
                onClick={handleOpenAdd}
                className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold inline-flex items-center gap-2 shadow-sm transition"
              >
                <Plus className="w-4 h-4" />
                <span>Ajouter mon premier contact</span>
              </button>
            )}
          </div>
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingContact ? 'Modifier le Contact' : 'Nouveau Contact'}
      >
        <form onSubmit={handleSave} className="space-y-3.5 text-xs">
          {/* Optional Photo Picker */}
          <div className="flex items-center gap-3.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <div className="relative w-16 h-16 rounded-full overflow-hidden bg-[#0b1f42] text-white flex items-center justify-center font-bold text-base shrink-0 border-2 border-blue-200 dark:border-blue-800">
              {form.avatarDataUrl ? (
                <img
                  src={form.avatarDataUrl}
                  alt="Aperçu photo contact"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span>{formInitials}</span>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="font-semibold text-slate-800 dark:text-slate-200">
                Photo du contact <span className="text-slate-400 font-normal">(facultative)</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="px-3 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer transition">
                  <ImageIcon className="w-3.5 h-3.5" />
                  <span>{form.avatarDataUrl ? 'Remplacer' : 'Galerie'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleContactPhotoPick}
                    className="hidden"
                  />
                </label>

                <label className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold inline-flex items-center gap-1.5 cursor-pointer transition">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Appareil photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handleContactPhotoPick}
                    className="hidden"
                  />
                </label>

                {form.avatarDataUrl && (
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, avatarDataUrl: undefined }))}
                    className="px-2.5 py-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 font-semibold inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Retirer</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Prénom *</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Nom</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Téléphone (avec indicatif) *</label>
              <input
                type="tel"
                required
                placeholder="Numéro avec indicatif pays"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Lien / Relation</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as ContactCategory })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Quartier</label>
              <input
                type="text"
                value={form.neighborhood}
                onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Email (facultatif)</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Notes personnelles</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          {!editingContact && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => vcfImportRef.current?.click()}
                className="text-[11px] font-semibold text-blue-700 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Ou importer un fichier .vcf / CSV</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 font-semibold text-slate-600"
            >
              Annuler
            </button>
            <button
              type="submit"
              className="px-5 py-2 font-bold text-white bg-blue-700 hover:bg-blue-800 rounded-xl"
            >
              Enregistrer
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={isExportConfirmOpen}
        title="Confirmer l’exportation des contacts ?"
        message={`Vous êtes sur le point d’exporter ${contacts.length} fiche(s) contact dans un fichier CSV sur votre appareil. Veuillez confirmer cette exportation.`}
        confirmLabel="Oui, exporter le fichier CSV"
        cancelLabel="Annuler"
        onConfirm={executeExportCSV}
        onCancel={() => setIsExportConfirmOpen(false)}
      />

      <ConfirmDialog
        isOpen={!!deletingId}
        title="Supprimer ce contact ?"
        message="Cette action supprimera définitivement ce contact du répertoire."
        confirmLabel="Supprimer"
        isDestructive
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      <ConfirmDialog
        isOpen={isBulkDeleteOpen}
        title="Supprimer les contacts sélectionnés ?"
        message={`Cette action supprimera définitivement ${selectedContactIds.length} contact(s) sélectionné(s).`}
        confirmLabel="Oui, supprimer en masse"
        isDestructive
        onConfirm={handleConfirmBulkDelete}
        onCancel={() => setIsBulkDeleteOpen(false)}
      />
    </div>
  );
};
