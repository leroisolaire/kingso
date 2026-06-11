import type { Category } from '@/types/category'
import type { Document } from '@/types/document'
import type { Faq } from '@/types/faq'
import type { HistoryEntry } from '@/types/history'

export const MOCK_CATEGORIES: Category[] = [
  { id: 'cat-1', name: 'Installation', description: "Guides et procédures d'installation", createdAt: '2025-01-10T08:00:00Z' },
  { id: 'cat-2', name: 'Maintenance', description: 'Entretien et maintenance des équipements', createdAt: '2025-01-10T08:00:00Z' },
  { id: 'cat-3', name: 'Commercial', description: 'Tarifs, offres et conditions commerciales', createdAt: '2025-01-10T08:00:00Z' },
  { id: 'cat-4', name: 'Franchise', description: 'Documents réservés aux franchisés', createdAt: '2025-01-10T08:00:00Z' },
]

export const MOCK_DOCUMENTS: Document[] = [
  {
    id: 'doc-1',
    title: "Guide d'installation des panneaux solaires",
    content:
      "Ce guide détaille les étapes complètes pour l'installation de panneaux photovoltaïques Le Roi Solaire. Étape 1 : Évaluation de la toiture. Étape 2 : Pose des rails de fixation. Étape 3 : Raccordement électrique. Étape 4 : Mise en service et vérification.",
    type: 'PUBLIC',
    categoryId: 'cat-1',
    createdAt: '2025-02-01T10:00:00Z',
    updatedAt: '2025-02-01T10:00:00Z',
  },
  {
    id: 'doc-2',
    title: 'Procédure de maintenance annuelle',
    content:
      "La maintenance annuelle comprend : nettoyage des panneaux, inspection des connexions électriques, vérification de l'onduleur, test de production. Fréquence recommandée : une fois par an, idéalement au printemps.",
    type: 'PUBLIC',
    categoryId: 'cat-2',
    createdAt: '2025-02-15T10:00:00Z',
    updatedAt: '2025-03-01T12:00:00Z',
  },
  {
    id: 'doc-3',
    title: 'Grille tarifaire 2025',
    content:
      "Tarifs internes réservés aux équipes commerciales. Pack Essentiel : 6 500 € (6 panneaux, 3 kWc). Pack Confort : 10 200 € (10 panneaux, 5 kWc). Pack Premium : 15 800 € (16 panneaux, 8 kWc). Ces prix sont HT et hors pose.",
    type: 'INTERNAL',
    categoryId: 'cat-3',
    createdAt: '2025-01-02T09:00:00Z',
    updatedAt: '2025-01-02T09:00:00Z',
  },
  {
    id: 'doc-4',
    title: 'Manuel opérationnel franchisé — édition 2025',
    content:
      "Ce manuel décrit les obligations et les droits des franchisés Le Roi Solaire. Charte visuelle, standards de service, formation obligatoire, redevances mensuelles, territoire exclusif. Document confidentiel — usage interne franchisé.",
    type: 'FRANCHISE',
    categoryId: 'cat-4',
    createdAt: '2025-01-15T09:00:00Z',
    updatedAt: '2025-04-10T14:00:00Z',
  },
  {
    id: 'doc-5',
    title: 'Conditions de garantie produits',
    content:
      "Tous les panneaux Le Roi Solaire bénéficient d'une garantie produit de 12 ans et d'une garantie de performance de 25 ans (80 % de la puissance nominale). La garantie couvre les défauts de fabrication, mais pas les dommages liés aux intempéries exceptionnelles.",
    type: 'PUBLIC',
    categoryId: 'cat-2',
    createdAt: '2025-03-05T11:00:00Z',
    updatedAt: '2025-03-05T11:00:00Z',
  },
]

export const MOCK_FAQS: Faq[] = [
  {
    id: 'faq-1',
    question: 'Combien de temps dure une installation ?',
    answer: "Une installation standard (6 à 10 panneaux) prend généralement 1 à 2 jours. Les installations plus importantes peuvent nécessiter 3 à 4 jours.",
    categoryId: 'cat-1',
    published: true,
    order: 1,
    createdAt: '2025-02-20T10:00:00Z',
    updatedAt: '2025-02-20T10:00:00Z',
  },
  {
    id: 'faq-2',
    question: "Quelle est la durée de vie des panneaux solaires ?",
    answer: "Nos panneaux sont conçus pour durer 30 ans ou plus. Nous garantissons 80 % de la puissance nominale pendant 25 ans.",
    categoryId: 'cat-2',
    published: true,
    order: 2,
    createdAt: '2025-02-20T10:00:00Z',
    updatedAt: '2025-02-20T10:00:00Z',
  },
  {
    id: 'faq-3',
    question: "Les panneaux fonctionnent-ils par temps nuageux ?",
    answer: "Oui, les panneaux photovoltaïques produisent de l'électricité même par temps couvert, mais avec un rendement réduit (environ 20 à 30 % par rapport à un ensoleillement optimal).",
    categoryId: 'cat-1',
    published: true,
    order: 3,
    createdAt: '2025-03-01T10:00:00Z',
    updatedAt: '2025-03-01T10:00:00Z',
  },
  {
    id: 'faq-4',
    question: "Existe-t-il des aides financières pour l'installation ?",
    answer: "Oui, plusieurs dispositifs existent : MaPrimeRénov', prime à l'autoconsommation, TVA réduite à 10 %. Contactez notre équipe pour un bilan personnalisé.",
    categoryId: 'cat-3',
    published: true,
    order: 4,
    createdAt: '2025-03-10T10:00:00Z',
    updatedAt: '2025-03-10T10:00:00Z',
  },
  {
    id: 'faq-5',
    question: "Comment suivre la production de mes panneaux ?",
    answer: "Un suivi en temps réel est accessible via l'application mobile Le Roi Solaire ou le portail web. Vous pouvez suivre la production quotidienne, mensuelle et annuelle.",
    categoryId: 'cat-2',
    published: false,
    order: 5,
    createdAt: '2025-04-01T10:00:00Z',
    updatedAt: '2025-04-01T10:00:00Z',
  },
]

export const MOCK_HISTORY: HistoryEntry[] = [
  {
    id: 'hist-1',
    sessionToken: 'sess-abc123',
    userMessage: "Quelle est la durée de la garantie sur les panneaux ?",
    assistantMessage: "D'après notre documentation, tous les panneaux Le Roi Solaire bénéficient d'une garantie produit de 12 ans et d'une garantie de performance de 25 ans (80 % de la puissance nominale).",
    documentsUsed: ['doc-5'],
    createdAt: '2025-06-01T14:32:00Z',
  },
  {
    id: 'hist-2',
    sessionToken: 'sess-def456',
    userMessage: "Combien coûte une installation ?",
    assistantMessage: "Je ne dispose pas des informations tarifaires dans les documents publics. Pour obtenir un devis personnalisé, je vous invite à contacter directement notre équipe commerciale.",
    documentsUsed: [],
    createdAt: '2025-06-02T09:15:00Z',
  },
  {
    id: 'hist-3',
    sessionToken: 'sess-ghi789',
    userMessage: "Comment se déroule l'installation ?",
    assistantMessage: "L'installation des panneaux solaires Le Roi Solaire se déroule en 4 étapes : évaluation de la toiture, pose des rails de fixation, raccordement électrique, puis mise en service et vérification.",
    documentsUsed: ['doc-1'],
    createdAt: '2025-06-03T11:00:00Z',
  },
]
