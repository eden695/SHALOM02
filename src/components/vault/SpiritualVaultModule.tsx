import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Vault,
  BookOpen,
  Upload,
  Download,
  FileText,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Search,
  Lock,
  Share2,
  Globe,
  ExternalLink,
  Loader2,
  AlertCircle,
  CheckSquare,
  Square,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { useShalomDB } from '../../hooks/useShalomDB';
import { dbService, STORES } from '../../services/db';
import { useLanguage } from '../../contexts/LanguageContext';
import { useOnlineStatus, fetchWithTimeout } from '../../services/connectivity';
import { VaultDocument } from '../../types';
import { Modal } from '../common/Modal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SocialShareModal } from '../common/SocialShareModal';
import { SharePayload } from '../../services/socialShare';

interface OnlineBookEntry {
  bookId: string;
  source: 'wikisource' | 'openlibrary';
  wikiLang?: 'fr' | 'en';
  wikiPage?: string;
  openLibraryKey?: string;
  iaId?: string;
  coverUrl?: string;
  title: string;
  author: string;
  category: 'livre' | 'etude';
  description: string;
  sourceUrl: string;
  epubUrl?: string;
  pdfUrl?: string;
  isFullTextOffline: boolean;
}

const BOOK_SEARCH_CACHE = new Map<string, { ts: number; items: OnlineBookEntry[] }>();
const BOOK_SEARCH_CACHE_TTL = 5 * 60 * 1000;

function extractCleanTextFromWikisourceHtml(html: string): {
  text: string;
  subPages: string[];
} {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const subPages: string[] = [];
  doc.querySelectorAll('a[href^="/wiki/"]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (
      !href.includes(':') &&
      !href.includes('#') &&
      (href.includes('/Chapitre') ||
        href.includes('/Livre') ||
        href.includes('/Chapter') ||
        href.includes('/Part'))
    ) {
      const pageName = decodeURIComponent(href.replace(/^\/wiki\//, ''));
      if (!subPages.includes(pageName)) subPages.push(pageName);
    }
  });

  doc
    .querySelectorAll(
      '#headertemplate, .ws-noexport, .mw-editsection, .prp-page-qualityheader, .footertemplate, style, script'
    )
    .forEach((el) => el.remove());

  const blocks: string[] = [];
  doc.querySelectorAll('h1, h2, h3, h4, p, li, blockquote').forEach((el) => {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (txt && txt.length > 1) {
      blocks.push(txt);
    }
  });

  const cleanText =
    blocks.length > 0
      ? blocks.join('\n\n')
      : (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();

  return { text: cleanText, subPages };
}

async function fetchWikisourceBookText(
  wikiLang: string,
  pageTitle: string,
  onProgress?: (msg: string) => void
): Promise<string> {
  const endpoint = `https://${wikiLang}.wikisource.org/w/api.php`;
  const fetchPage = async (title: string) => {
    const url = `${endpoint}?action=parse&page=${encodeURIComponent(
      title
    )}&prop=text&format=json&origin=*`;
    const res = await fetchWithTimeout(url, {}, 7500);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      parse?: { title?: string; text?: { '*': string } };
      error?: { info?: string };
    };
    if (data.error || !data.parse?.text?.['*']) {
      throw new Error(data.error?.info || 'Page introuvable sur Wikisource.');
    }
    return extractCleanTextFromWikisourceHtml(data.parse.text['*']);
  };

  onProgress?.('Téléchargement depuis Wikisource...');
  const root = await fetchPage(pageTitle);

  const prefix = pageTitle.split('/')[0];
  const relevantSubs = root.subPages
    .filter((sp) => sp.startsWith(prefix) && sp !== pageTitle)
    .slice(0, 12);

  if (root.text.length < 1800 && relevantSubs.length > 0) {
    const sections: string[] = [root.text];
    const BATCH_SIZE = 4;
    for (let i = 0; i < relevantSubs.length; i += BATCH_SIZE) {
      const batch = relevantSubs.slice(i, i + BATCH_SIZE);
      onProgress?.(
        `Téléchargement chapitres ${Math.min(i + batch.length, relevantSubs.length)}/${relevantSubs.length}...`
      );
      const settled = await Promise.allSettled(
        batch.map(async (subTitle) => {
          const sub = await fetchPage(subTitle);
          return { subTitle, text: sub.text };
        })
      );
      for (const item of settled) {
        if (item.status === 'fulfilled' && item.value.text.trim()) {
          sections.push(
            `\n==============================\n${item.value.subTitle.replace(/_/g, ' ')}\n==============================\n\n${item.value.text}`
          );
        }
      }
    }
    return sections.join('\n\n');
  }

  return root.text;
}

export const SpiritualVaultModule: React.FC = () => {
  const { lang } = useLanguage();
  const { vaultDocuments, reloadData } = useShalomDB();
  const isOnline = useOnlineStatus();
  const isEn = lang === 'en';

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Online Books Download Modal (directly integrated inside Coffre Spirituel)
  const [isOnlineBooksModalOpen, setIsOnlineBooksModalOpen] = useState(false);
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [lastOnlineQuery, setLastOnlineQuery] = useState('');
  const [onlineSearchLang, setOnlineSearchLang] = useState<'fr' | 'en'>(
    lang === 'en' ? 'en' : 'fr'
  );
  const [onlineResults, setOnlineResults] = useState<OnlineBookEntry[]>([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [downloadingBookId, setDownloadingBookId] = useState<string | null>(null);
  const [downloadProgressMsg, setDownloadProgressMsg] = useState<string | null>(null);
  const [previewBook, setPreviewBook] = useState<OnlineBookEntry | null>(null);
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteCategory, setNoteCategory] = useState<VaultDocument['category']>('note');
  const [noteAuthor, setNoteAuthor] = useState('');
  const [noteContent, setNoteContent] = useState('');

  const [viewingDoc, setViewingDoc] = useState<VaultDocument | null>(null);
  const [viewingBlobUrl, setViewingBlobUrl] = useState<string | null>(null);
  const [viewingText, setViewingText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [confirmDeleteDocs, setConfirmDeleteDocs] = useState<VaultDocument[] | null>(null);
  const [sharePayload, setSharePayload] = useState<SharePayload | null>(null);

  const bookSearchAbortRef = useRef<AbortController | null>(null);
  const bookSearchSeqRef = useRef(0);

  useEffect(() => {
    return () => {
      bookSearchAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    let activeUrl: string | null = null;
    if (!viewingDoc) {
      setViewingBlobUrl(null);
      setViewingText(null);
      return;
    }

    if (viewingDoc.textContent) {
      setViewingText(viewingDoc.textContent);
      setViewingBlobUrl(null);
      return;
    }

    if (viewingDoc.blobKey) {
      dbService.getMediaBlob(viewingDoc.blobKey).then(async (blob) => {
        if (!blob) return;
        if (
          viewingDoc.mimeType.startsWith('text/') ||
          viewingDoc.fileName.endsWith('.txt') ||
          viewingDoc.fileName.endsWith('.md')
        ) {
          const txt = await blob.text();
          setViewingText(txt);
        } else {
          activeUrl = URL.createObjectURL(blob);
          setViewingBlobUrl(activeUrl);
        }
      });
    }

    return () => {
      if (activeUrl) URL.revokeObjectURL(activeUrl);
    };
  }, [viewingDoc]);

  const handleImportFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    let added = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const blobKey = `vault_blob_${Date.now()}_${i}`;
      await dbService.saveMediaBlob(blobKey, file, file.type || 'application/octet-stream');

      const doc: VaultDocument = {
        id: `vdoc_${Date.now()}_${i}`,
        title: file.name.replace(/\.[^.]+$/, ''),
        category:
          file.type.includes('pdf') || file.name.endsWith('.epub') ? 'livre' : 'autre',
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
        blobKey,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.VAULT_DOCUMENTS, doc);
      added++;
    }

    e.target.value = '';
    setNotice(
      isEn
        ? `${added} book/file(s) stored in your Spiritual Vault.`
        : `${added} livre(s) / fichier(s) enregistré(s) dans votre Coffre Spirituel.`
    );
    reloadData();
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;
    const bytes = new TextEncoder().encode(noteContent).length;
    const doc: VaultDocument = {
      id: `vdoc_${Date.now()}`,
      title: noteTitle.trim(),
      category: noteCategory,
      author: noteAuthor.trim() || undefined,
      fileName: `${noteTitle.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}.txt`,
      mimeType: 'text/plain;charset=utf-8',
      sizeBytes: bytes,
      textContent: noteContent,
      createdAt: new Date().toISOString(),
    };
    await dbService.put(STORES.VAULT_DOCUMENTS, doc);
    setNoteTitle('');
    setNoteAuthor('');
    setNoteContent('');
    setIsNoteModalOpen(false);
    setNotice(
      isEn ? 'Private spiritual note saved in vault.' : 'Document enregistré dans votre Coffre Spirituel.'
    );
    reloadData();
  };

  const handleSearchOnlineBooks = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = onlineSearchQuery.trim();
    if (!q) {
      setOnlineResults([]);
      setLastOnlineQuery('');
      return;
    }

    if (!isOnline) {
      setOnlineError(
        isEn
          ? 'Internet connection required to search books online. Your stored books remain readable offline.'
          : 'Connexion Internet requise pour rechercher des livres en ligne. Vos livres déjà enregistrés restent lisibles hors ligne.'
      );
      return;
    }

    const cacheKey = `${onlineSearchLang}:${q.toLowerCase()}`;
    const cached = BOOK_SEARCH_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < BOOK_SEARCH_CACHE_TTL) {
      setLastOnlineQuery(q);
      setOnlineError(null);
      setPreviewBook(null);
      setPreviewText(null);
      setOnlineResults(cached.items);
      return;
    }

    bookSearchAbortRef.current?.abort();
    const controller = new AbortController();
    bookSearchAbortRef.current = controller;
    const seq = ++bookSearchSeqRef.current;

    setLastOnlineQuery(q);
    setIsSearchingOnline(true);
    setOnlineError(null);
    setPreviewBook(null);
    setPreviewText(null);

    try {
      const wsPromise = fetchWithTimeout(
        `https://${onlineSearchLang}.wikisource.org/w/api.php?action=opensearch&search=${encodeURIComponent(
          q
        )}&limit=10&format=json&origin=*`,
        { signal: controller.signal },
        7500
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const olPromise = fetchWithTimeout(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(
          q
        )}&limit=8&fields=key,title,author_name,first_publish_year,cover_i,ia`,
        { signal: controller.signal },
        7500
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

      const [wsData, olData] = await Promise.all([wsPromise, olPromise]);
      if (seq !== bookSearchSeqRef.current || controller.signal.aborted) return;

      const combined: OnlineBookEntry[] = [];

      if (Array.isArray(wsData)) {
        const titles = (wsData[1] as string[]) || [];
        const urls = (wsData[3] as string[]) || [];
        titles.forEach((title, idx) => {
          const wikiPage = title.replace(/ /g, '_');
          combined.push({
            bookId: `ws_${onlineSearchLang}_${wikiPage}`,
            source: 'wikisource',
            wikiLang: onlineSearchLang,
            wikiPage,
            title,
            author: `Wikisource (${onlineSearchLang.toUpperCase()})`,
            category: 'livre',
            description: isEn
              ? 'Full public-domain book downloadable directly into your Vault for 100% offline reading.'
              : 'Livre / texte intégral du domaine public téléchargeable directement dans le Coffre pour lecture 100 % hors ligne.',
            sourceUrl:
              urls[idx] ||
              `https://${onlineSearchLang}.wikisource.org/wiki/${encodeURIComponent(wikiPage)}`,
            epubUrl: `https://ws-export.wmcloud.org/?lang=${onlineSearchLang}&format=epub&page=${encodeURIComponent(
              wikiPage
            )}`,
            pdfUrl: `https://ws-export.wmcloud.org/?lang=${onlineSearchLang}&format=pdf&page=${encodeURIComponent(
              wikiPage
            )}`,
            isFullTextOffline: true,
          });
        });
      }

      if (olData && Array.isArray((olData as { docs?: unknown[] }).docs)) {
        const docs = (olData as {
          docs: Array<{
            key?: string;
            title?: string;
            author_name?: string[];
            first_publish_year?: number;
            cover_i?: number;
            ia?: string[];
          }>;
        }).docs;

        docs.forEach((d) => {
          if (!d.title || !d.key) return;
          const workId = d.key.replace(/^\/works\//, '');
          const iaId = Array.isArray(d.ia) && d.ia.length > 0 ? d.ia[0] : undefined;
          const author =
            Array.isArray(d.author_name) && d.author_name.length > 0
              ? d.author_name.slice(0, 2).join(', ')
              : isEn
                ? 'Author'
                : 'Auteur';
          combined.push({
            bookId: `ol_${workId}`,
            source: 'openlibrary',
            openLibraryKey: d.key,
            iaId,
            coverUrl: d.cover_i
              ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg`
              : undefined,
            title: d.title,
            author: d.first_publish_year ? `${author} (${d.first_publish_year})` : author,
            category: 'livre',
            description: iaId
              ? isEn
                ? 'Indexed on Open Library with downloadable synopsis & direct Internet Archive EPUB/PDF links.'
                : 'Référencé sur Open Library avec résumé téléchargeable et liens directs EPUB/PDF.'
              : isEn
                ? 'Book record indexed on Open Library.'
                : 'Fiche de livre référencée sur Open Library.',
            sourceUrl: `https://openlibrary.org${d.key}`,
            epubUrl: iaId ? `https://archive.org/download/${iaId}/${iaId}.epub` : undefined,
            pdfUrl: iaId ? `https://archive.org/download/${iaId}/${iaId}.pdf` : undefined,
            isFullTextOffline: false,
          });
        });
      }

      if (combined.length > 0) {
        BOOK_SEARCH_CACHE.set(cacheKey, { ts: Date.now(), items: combined });
      }
      setOnlineResults(combined);
      if (combined.length === 0) {
        setOnlineError(
          isEn
            ? `No books found for « ${q} ». Try another keyword or author name.`
            : `Aucun résultat trouvé pour « ${q} ». Essayez un autre titre, mot-clé ou auteur.`
        );
      }
    } catch {
      if (seq !== bookSearchSeqRef.current || controller.signal.aborted) return;
      setOnlineError(
        isEn
          ? 'Unable to search books online right now. Check your internet connection.'
          : 'Impossible de rechercher des livres en ligne pour le moment. Vérifiez votre connexion.'
      );
    } finally {
      if (seq === bookSearchSeqRef.current) {
        setIsSearchingOnline(false);
      }
    }
  };

  const handlePreviewOnlineBook = async (book: OnlineBookEntry) => {
    setPreviewBook(book);
    setPreviewText(null);
    setLoadingPreview(true);
    try {
      if (book.source === 'wikisource' && book.wikiLang && book.wikiPage) {
        const res = await fetchWithTimeout(
          `https://${book.wikiLang}.wikisource.org/w/api.php?action=parse&page=${encodeURIComponent(
            book.wikiPage
          )}&prop=text&format=json&origin=*`,
          {},
          9000
        );
        if (res.ok) {
          const data = (await res.json()) as { parse?: { text?: { '*': string } } };
          const html = data.parse?.text?.['*'];
          if (html) {
            const parsed = extractCleanTextFromWikisourceHtml(html);
            setPreviewText(parsed.text.slice(0, 1400) + (parsed.text.length > 1400 ? '...' : ''));
            setLoadingPreview(false);
            return;
          }
        }
      } else if (book.openLibraryKey) {
        const res = await fetchWithTimeout(
          `https://openlibrary.org${book.openLibraryKey}.json`,
          {},
          8000
        );
        if (res.ok) {
          const work = (await res.json()) as {
            description?: string | { value?: string };
            subjects?: string[];
          };
          const desc =
            typeof work.description === 'string'
              ? work.description
              : work.description?.value || '';
          const subs = Array.isArray(work.subjects) ? work.subjects.slice(0, 6).join(' · ') : '';
          setPreviewText(
            [desc || book.description, subs ? `Sujets : ${subs}` : ''].filter(Boolean).join('\n\n')
          );
          setLoadingPreview(false);
          return;
        }
      }
      setPreviewText(book.description);
    } catch {
      setPreviewText(book.description);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadOnlineBookIntoVault = async (book: OnlineBookEntry) => {
    const existing = vaultDocuments.find((d) => d.bookId === book.bookId);
    if (existing) {
      setNotice(
        isEn
          ? `« ${book.title} » is already saved in your Vault.`
          : `« ${book.title} » est déjà enregistré dans votre Coffre.`
      );
      setIsOnlineBooksModalOpen(false);
      return;
    }

    if (!isOnline) {
      setOnlineError(
        isEn
          ? 'Internet connection required to download this book.'
          : 'Connexion Internet requise pour télécharger ce livre.'
      );
      return;
    }

    setDownloadingBookId(book.bookId);
    setDownloadProgressMsg(
      isEn ? 'Downloading book into your Vault...' : 'Téléchargement du livre dans votre Coffre...'
    );
    setOnlineError(null);

    try {
      let bodyText = '';
      if (book.source === 'wikisource' && book.wikiLang && book.wikiPage) {
        bodyText = await fetchWikisourceBookText(
          book.wikiLang,
          book.wikiPage,
          (msg) => setDownloadProgressMsg(msg)
        );
      } else {
        let olSynopsis = '';
        if (book.openLibraryKey) {
          try {
            const res = await fetchWithTimeout(
              `https://openlibrary.org${book.openLibraryKey}.json`,
              {},
              8000
            );
            if (res.ok) {
              const work = (await res.json()) as {
                description?: string | { value?: string };
                subjects?: string[];
              };
              const desc =
                typeof work.description === 'string'
                  ? work.description
                  : work.description?.value || '';
              if (desc) olSynopsis = `\nRésumé :\n${desc}\n`;
            }
          } catch {
            // ignore
          }
        }
        bodyText = [
          book.description,
          olSynopsis,
          `Consultation en ligne : ${book.sourceUrl}`,
          book.epubUrl ? `Fichier EPUB direct : ${book.epubUrl}` : '',
          book.pdfUrl ? `Fichier PDF direct : ${book.pdfUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n');
      }

      const fullContent = `${book.title}\n${book.author}\nSource : ${book.sourceUrl}\n\n========================================\n\n${bodyText}`;
      const blob = new Blob([fullContent], { type: 'text/plain;charset=utf-8' });
      const blobKey = `vault_book_${book.bookId}_${Date.now()}`;
      await dbService.saveMediaBlob(blobKey, blob, 'text/plain;charset=utf-8');

      const doc: VaultDocument = {
        id: `vdoc_${book.bookId}_${Date.now()}`,
        title: book.title,
        category: book.category,
        author: book.author,
        description: book.description,
        fileName: `${book.title.replace(/[^a-z0-9àâéèêîôùûç_-]+/gi, '_').slice(0, 50)}.txt`,
        mimeType: 'text/plain;charset=utf-8',
        sizeBytes: blob.size,
        blobKey,
        textContent: fullContent,
        isBuiltInBook: false,
        bookId: book.bookId,
        sourceUrl: book.sourceUrl,
        epubUrl: book.epubUrl,
        createdAt: new Date().toISOString(),
      };
      await dbService.put(STORES.VAULT_DOCUMENTS, doc);

      setNotice(
        isEn
          ? `« ${book.title} » saved in your SHALOM Vault for offline reading!`
          : `« ${book.title} » téléchargé dans votre Coffre Spirituel ! Vous pouvez désormais le lire hors ligne.`
      );
      setIsOnlineBooksModalOpen(false);
      reloadData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau';
      setOnlineError(
        isEn
          ? `Download failed (${msg}).`
          : `Échec du téléchargement (${msg}). Réessayez lorsque la connexion est stable.`
      );
    } finally {
      setDownloadingBookId(null);
      setDownloadProgressMsg(null);
    }
  };

  const triggerBlobDownload = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleSaveDocToPhone = async (doc: VaultDocument) => {
    if (doc.blobKey) {
      const blob = await dbService.getMediaBlob(doc.blobKey);
      if (blob) {
        triggerBlobDownload(blob, doc.fileName);
        setNotice(
          isEn
            ? `Sent « ${doc.title} » to your phone Downloads.`
            : `« ${doc.title} » exporté sur votre téléphone.`
        );
        return;
      }
    }
    if (doc.textContent) {
      const blob = new Blob([doc.textContent], { type: 'text/plain;charset=utf-8' });
      const fileName = doc.fileName.endsWith('.txt') ? doc.fileName : `${doc.fileName}.txt`;
      triggerBlobDownload(blob, fileName);
      setNotice(
        isEn ? `Sent « ${doc.title} » to your phone.` : `« ${doc.title} » exporté sur votre téléphone.`
      );
    }
  };

  const handleBulkSaveToPhone = async () => {
    const targets = vaultDocuments.filter((d) => selectedDocIds.includes(d.id));
    for (const doc of targets) {
      await handleSaveDocToPhone(doc);
    }
  };

  const handleShareVaultDoc = async (doc: VaultDocument) => {
    let file: File | undefined;
    if (doc.blobKey) {
      const blob = await dbService.getMediaBlob(doc.blobKey);
      if (blob) {
        file = new File([blob], doc.fileName, { type: doc.mimeType || 'text/plain' });
      }
    } else if (doc.textContent) {
      const blob = new Blob([doc.textContent], { type: 'text/plain;charset=utf-8' });
      file = new File([blob], doc.fileName, { type: 'text/plain' });
    }

    const lines = [
      `📖 ${doc.title}`,
      doc.author ? `✍️ ${doc.author}` : '',
      doc.sourceUrl ? `🔗 Lien : ${doc.sourceUrl}` : '',
      doc.epubUrl ? `📥 EPUB : ${doc.epubUrl}` : '',
      '',
      'Partagé depuis Mon Coffre Spirituel · SHALOM',
    ].filter(Boolean);

    setSharePayload({
      title: doc.title,
      text: lines.join('\n'),
      url: doc.sourceUrl,
      file,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteDocs || confirmDeleteDocs.length === 0) return;
    const blobKeys = confirmDeleteDocs
      .map((d) => d.blobKey)
      .filter((k): k is string => !!k);
    const ids = confirmDeleteDocs.map((d) => d.id);
    if (blobKeys.length > 0) {
      await dbService.deleteItems(STORES.MEDIA_BLOBS, blobKeys);
    }
    await dbService.deleteItems(STORES.VAULT_DOCUMENTS, ids);
    setSelectedDocIds((prev) => prev.filter((id) => !ids.includes(id)));
    setConfirmDeleteDocs(null);
    reloadData();
  };

  const filteredVaultDocs = useMemo(() => {
    return vaultDocuments.filter((doc) => {
      const matchesCat = categoryFilter === 'all' || doc.category === categoryFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !q ||
        doc.title.toLowerCase().includes(q) ||
        (doc.author || '').toLowerCase().includes(q);
      return matchesCat && matchesSearch;
    });
  }, [vaultDocuments, categoryFilter, searchQuery]);

  const toggleSelectDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleAllDocs = () => {
    const visibleIds = filteredVaultDocs.map((d) => d.id);
    const allSel = visibleIds.length > 0 && visibleIds.every((id) => selectedDocIds.includes(id));
    setSelectedDocIds(allSel ? [] : visibleIds);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header + Prominent Online Download Button inside Coffre Spirituel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 font-display tracking-tight">
            <Vault className="w-6 h-6 text-blue-700 dark:text-blue-400" />
            <span>{isEn ? 'My Spiritual Vault' : 'Mon Coffre Spirituel'}</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span>
              {isEn
                ? 'Your books, Bible studies & private documents — readable offline anytime'
                : 'Vos livres, études et documents conservés sur cet appareil — lisibles hors ligne'}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setOnlineError(null);
            setIsOnlineBooksModalOpen(true);
          }}
          className="min-h-[44px] px-4 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs transition shrink-0"
        >
          <Globe className="w-4 h-4 shrink-0" />
          <span>{isEn ? 'Download Books Online' : 'Télécharger des livres en ligne'}</span>
        </button>
      </div>

      {notice && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{notice}</span>
          </span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs underline">
            OK
          </button>
        </div>
      )}

      {errorBanner && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-xs font-semibold text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorBanner}</span>
          </span>
          <button type="button" onClick={() => setErrorBanner(null)} className="text-xs underline">
            OK
          </button>
        </div>
      )}

      {/* Coffre Spirituel Content */}
      <div className="space-y-4">
        {vaultDocuments.length === 0 ? (
          <div className="py-12 px-6 text-center rounded-3xl bg-white dark:bg-[#0c1631] border border-dashed border-slate-300 dark:border-slate-800 space-y-5">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 flex items-center justify-center mx-auto">
              <Vault className="w-7 h-7" />
            </div>
            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {isEn ? 'Your Spiritual Vault is Empty' : 'Votre Coffre Spirituel est vide'}
              </h3>
              <p className="text-xs sm:text-sm text-slate-500">
                {isEn
                  ? 'Download books online for offline reading, import local files (PDF, EPUB, TXT), or write private notes.'
                  : 'Téléchargez des livres en ligne pour les lire hors ligne, importez vos fichiers (PDF, EPUB, TXT) ou rédigez une note privée.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setOnlineError(null);
                  setIsOnlineBooksModalOpen(true);
                }}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>{isEn ? 'Download Books Online' : 'Télécharger des livres en ligne'}</span>
              </button>

              <label className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer">
                <Upload className="w-4 h-4" />
                <span>{isEn ? 'Import File' : 'Importer un fichier'}</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md,.doc,.docx,.epub,image/*,audio/*,video/*"
                  onChange={handleImportFiles}
                  className="hidden"
                />
              </label>

              <button
                type="button"
                onClick={() => setIsNoteModalOpen(true)}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-semibold inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'New Note' : 'Écrire une note'}</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-3 justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={isEn ? 'Search my vault...' : 'Rechercher dans mon coffre...'}
                  className="w-full min-h-[44px] pl-10 pr-3 text-xs sm:text-sm rounded-xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <label className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition">
                  <Upload className="w-4 h-4" />
                  <span>{isEn ? 'Import File' : 'Importer un fichier'}</span>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.txt,.md,.doc,.docx,.epub,image/*,audio/*,video/*"
                    onChange={handleImportFiles}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={() => setIsNoteModalOpen(true)}
                  className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isEn ? 'Write Note' : 'Écrire'}</span>
                </button>
              </div>
            </div>

            <div className="studio-scroll-x gap-1.5 pb-1">
              {[
                { id: 'all', label: isEn ? `All (${vaultDocuments.length})` : `Tous (${vaultDocuments.length})` },
                { id: 'livre', label: isEn ? 'Books' : 'Livres' },
                { id: 'etude', label: isEn ? 'Bible Studies' : 'Études' },
                { id: 'note', label: isEn ? 'Personal Notes' : 'Notes' },
                { id: 'certificat', label: isEn ? 'Certificates' : 'Certificats' },
                { id: 'autre', label: isEn ? 'Other' : 'Autres' },
              ].map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryFilter(cat.id)}
                  className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap shrink-0 ${
                    categoryFilter === cat.id
                      ? 'bg-[#0b1f42] text-white dark:bg-blue-700'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {filteredVaultDocs.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                <button
                  type="button"
                  onClick={toggleAllDocs}
                  className="text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5 hover:text-blue-700"
                >
                  {filteredVaultDocs.every((d) => selectedDocIds.includes(d.id)) ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400" />
                  )}
                  <span>Tout sélectionner ({selectedDocIds.length})</span>
                </button>

                {selectedDocIds.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleBulkSaveToPhone}
                      className="px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Exporter ({selectedDocIds.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDeleteDocs(
                          vaultDocuments.filter((d) => selectedDocIds.includes(d.id))
                        )
                      }
                      className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Supprimer ({selectedDocIds.length})</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredVaultDocs.map((doc) => {
                const isSel = selectedDocIds.includes(doc.id);
                return (
                  <div
                    key={doc.id}
                    className={`p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#0c1631] border space-y-3 flex flex-col justify-between transition ${
                      isSel
                        ? 'border-blue-600 ring-2 ring-blue-600/20'
                        : 'border-slate-200/80 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSelectDoc(doc.id)}
                            aria-label="Sélectionner ce document"
                            className="text-slate-400 hover:text-blue-600 p-1 -ml-1"
                          >
                            {isSel ? (
                              <CheckSquare className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <span className="font-semibold text-blue-700 dark:text-blue-400">
                            {doc.category}
                            {doc.sourceUrl ? (isEn ? ' · Online Book' : ' · Téléchargé') : ''}
                          </span>
                        </div>
                        <span className="tabular-nums">{formatSize(doc.sizeBytes)}</span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className="truncate">{doc.title}</span>
                      </h4>
                      {doc.author && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">{doc.author}</p>
                      )}
                      {doc.description && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                          {doc.description}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      <span className="text-slate-400 tabular-nums">
                        {doc.createdAt.split('T')[0]}
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setViewingDoc(doc)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-semibold flex items-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Read' : 'Lire'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveDocToPhone(doc)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1.5"
                          title={isEn ? 'Send to phone' : 'Exporter sur mon téléphone'}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>{isEn ? 'Export' : 'Exporter'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleShareVaultDoc(doc)}
                          className="min-h-[40px] px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1"
                          title={isEn ? 'Share' : 'Partager'}
                        >
                          <Share2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteDocs([doc])}
                          className="min-h-[40px] p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Modal: Télécharger des livres en ligne */}
      <Modal
        isOpen={isOnlineBooksModalOpen}
        onClose={() => {
          bookSearchAbortRef.current?.abort();
          setIsSearchingOnline(false);
          setIsOnlineBooksModalOpen(false);
        }}
        title={isEn ? 'Download Books Online' : 'Télécharger des livres en ligne'}
        subtitle={
          isEn
            ? 'Search public-domain books & libraries and save directly into your Spiritual Vault for offline reading'
            : 'Recherchez un livre ou texte et enregistrez-le directement dans votre Coffre Spirituel (lisible hors ligne)'
        }
        maxWidth="3xl"
      >
        <div className="space-y-4 text-xs">
          {!isOnline && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 font-semibold flex items-center gap-2.5">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>
                {isEn
                  ? 'You are offline. Online book search requires an Internet connection, while all your downloaded books stay readable offline.'
                  : 'Vous êtes actuellement hors ligne. La recherche nécessite une connexion Internet ; vos livres déjà téléchargés restent lisibles sans connexion.'}
              </span>
            </div>
          )}

          <form onSubmit={handleSearchOnlineBooks} className="flex flex-col sm:flex-row gap-2">
            <select
              value={onlineSearchLang}
              onChange={(e) => setOnlineSearchLang(e.target.value as 'fr' | 'en')}
              className="min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-semibold"
            >
              <option value="fr">Français</option>
              <option value="en">English</option>
            </select>

            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={onlineSearchQuery}
                onChange={(e) => setOnlineSearchQuery(e.target.value)}
                placeholder={
                  isEn
                    ? 'Title or author (e.g. Bible, Psalms, Augustine, Imitation of Christ)...'
                    : 'Titre, sujet ou auteur (ex: Psaumes, Augustin, Pascal, Bible, Prière)...'
                }
                className="w-full min-h-[44px] pl-10 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>

            <button
              type="submit"
              disabled={isSearchingOnline}
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white font-bold flex items-center justify-center gap-1.5 shrink-0"
            >
              {isSearchingOnline ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span>{isEn ? 'Search' : 'Rechercher'}</span>
            </button>
          </form>

          {onlineError && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{onlineError}</span>
            </div>
          )}

          {downloadProgressMsg && (
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-blue-800 dark:text-blue-200 font-semibold flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
              <span>{downloadProgressMsg}</span>
            </div>
          )}

          {previewBook && (
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                  Aperçu : {previewBook.title}
                </h4>
                <button
                  type="button"
                  onClick={() => setPreviewBook(null)}
                  className="text-slate-500 hover:text-slate-800 font-semibold"
                >
                  Fermer l’aperçu
                </button>
              </div>
              {loadingPreview ? (
                <div className="flex items-center gap-2 text-slate-500 py-3">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Chargement de l’aperçu...</span>
                </div>
              ) : (
                <div className="max-h-40 overflow-y-auto whitespace-pre-wrap text-slate-700 dark:text-slate-300 font-serif leading-relaxed">
                  {previewText}
                </div>
              )}
            </div>
          )}

          {onlineResults.length === 0 && !isSearchingOnline ? (
            <div className="py-10 px-4 text-center rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-800 space-y-2">
              <BookOpen className="w-8 h-8 text-blue-700 dark:text-blue-400 mx-auto opacity-80" />
              <p className="font-bold text-slate-800 dark:text-slate-200">
                {lastOnlineQuery
                  ? 'Aucun résultat affiché'
                  : isEn
                    ? 'Enter a book title or author above'
                    : 'Saisissez un titre, thème ou auteur ci-dessus'}
              </p>
              <p className="text-slate-500 max-w-md mx-auto">
                {isEn
                  ? 'Real-time search via Wikisource (full downloadable offline books) & Open Library.'
                  : 'Recherche réelle via Wikisource (livres complets téléchargeables hors ligne) et Open Library.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 max-h-[55vh] overflow-y-auto pr-1">
              {onlineResults.map((book) => {
                const vaultCopy = vaultDocuments.find((d) => d.bookId === book.bookId);
                const isBusy = downloadingBookId === book.bookId;

                return (
                  <div
                    key={book.bookId}
                    className="p-4 rounded-2xl bg-white dark:bg-[#0c1631] border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-blue-700 dark:text-blue-400">
                          {book.source === 'wikisource'
                            ? `Wikisource · Texte complet`
                            : 'Open Library · Fiche & liens'}
                        </span>
                        <a
                          href={book.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                        >
                          <span>Source</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>

                      <div className="flex items-start gap-3">
                        {book.coverUrl && (
                          <img
                            src={book.coverUrl}
                            alt={book.title}
                            referrerPolicy="no-referrer"
                            className="w-11 h-16 object-cover rounded-lg border border-slate-200 dark:border-slate-800 shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">
                            {book.title}
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">{book.author}</p>
                        </div>
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                        {book.description}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => handlePreviewOnlineBook(book)}
                        className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Aperçu</span>
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleDownloadOnlineBookIntoVault(book)}
                        className={`min-h-[38px] flex-1 px-3 py-1.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition ${
                          vaultCopy
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/50'
                            : 'bg-blue-700 hover:bg-blue-800 text-white'
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : vaultCopy ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <Download className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {isBusy
                            ? 'Téléchargement...'
                            : vaultCopy
                              ? 'Dans mon coffre'
                              : 'Télécharger dans le coffre'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Modal Write Private Document */}
      <Modal
        isOpen={isNoteModalOpen}
        onClose={() => setIsNoteModalOpen(false)}
        title={isEn ? 'Create Private Spiritual Document' : 'Créer un document spirituel privé'}
        maxWidth="lg"
      >
        <form onSubmit={handleSaveNote} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Title *' : 'Titre *'}</label>
              <input
                type="text"
                required
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">{isEn ? 'Category' : 'Catégorie'}</label>
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value as VaultDocument['category'])}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
              >
                <option value="note">{isEn ? 'Personal Note' : 'Note spirituelle'}</option>
                <option value="etude">{isEn ? 'Bible Study' : 'Étude biblique'}</option>
                <option value="livre">{isEn ? 'Book / Treatise' : 'Livre / Texte'}</option>
                <option value="certificat">{isEn ? 'Certificate / Testimony' : 'Certificat / Acte'}</option>
                <option value="autre">{isEn ? 'Other' : 'Autre'}</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">
              {isEn ? 'Author / Source (optional)' : 'Auteur / Source'}
            </label>
            <input
              type="text"
              value={noteAuthor}
              onChange={(e) => setNoteAuthor(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1">{isEn ? 'Content *' : 'Contenu *'}</label>
            <textarea
              rows={8}
              required
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 leading-relaxed"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsNoteModalOpen(false)}
              className="min-h-[44px] px-4 py-2 rounded-xl text-slate-500 font-semibold"
            >
              {isEn ? 'Cancel' : 'Annuler'}
            </button>
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-bold"
            >
              {isEn ? 'Save to Vault' : 'Enregistrer dans le coffre'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Document / Book Reader */}
      <Modal
        isOpen={!!viewingDoc}
        onClose={() => setViewingDoc(null)}
        title={viewingDoc?.title || ''}
        subtitle={viewingDoc?.author || viewingDoc?.fileName}
        maxWidth="xl"
      >
        {viewingDoc && (
          <div className="space-y-4">
            {viewingDoc.sourceUrl && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                <a
                  href={viewingDoc.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{viewingDoc.sourceUrl}</span>
                </a>
                {viewingDoc.epubUrl && (
                  <a
                    href={viewingDoc.epubUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 font-semibold"
                  >
                    EPUB
                  </a>
                )}
              </div>
            )}

            {viewingText && (
              <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/40 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[60vh] overflow-y-auto text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-serif text-slate-800 dark:text-slate-100">
                {viewingText}
              </div>
            )}

            {viewingBlobUrl && viewingDoc.mimeType.startsWith('image/') && (
              <img
                src={viewingBlobUrl}
                alt={viewingDoc.title}
                className="max-h-[60vh] mx-auto rounded-xl object-contain"
              />
            )}

            {viewingBlobUrl && viewingDoc.mimeType.includes('pdf') && (
              <iframe
                src={viewingBlobUrl}
                title={viewingDoc.title}
                className="w-full h-[60vh] rounded-xl border border-slate-200 dark:border-slate-800"
              />
            )}

            {viewingBlobUrl && viewingDoc.mimeType.startsWith('audio/') && (
              <audio src={viewingBlobUrl} controls className="w-full" />
            )}

            {viewingBlobUrl && viewingDoc.mimeType.startsWith('video/') && (
              <video
                src={viewingBlobUrl}
                controls
                playsInline
                className="w-full max-h-[55vh] rounded-xl"
              />
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handleShareVaultDoc(viewingDoc)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Share2 className="w-4 h-4" />
                <span>{isEn ? 'Share' : 'Partager'}</span>
              </button>
              <button
                type="button"
                onClick={() => handleSaveDocToPhone(viewingDoc)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Smartphone className="w-4 h-4" />
                <span>{isEn ? 'Export to Phone' : 'Exporter sur mon téléphone'}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewingDoc(null)}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold"
              >
                {isEn ? 'Close' : 'Fermer'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirmDeleteDocs && confirmDeleteDocs.length > 0}
        title={isEn ? 'Remove from Spiritual Vault?' : 'Supprimer du Coffre Spirituel ?'}
        message={
          confirmDeleteDocs && confirmDeleteDocs.length === 1
            ? `${isEn ? 'Delete' : 'Supprimer'} « ${confirmDeleteDocs[0].title} » ?`
            : `${isEn ? 'Delete' : 'Supprimer'} ${confirmDeleteDocs?.length || 0} document(s) sélectionné(s) ?`
        }
        confirmLabel={isEn ? 'Delete' : 'Supprimer'}
        cancelLabel={isEn ? 'Cancel' : 'Annuler'}
        isDestructive
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteDocs(null)}
      />

      <SocialShareModal
        isOpen={!!sharePayload}
        onClose={() => setSharePayload(null)}
        payload={sharePayload}
      />
    </div>
  );
};
