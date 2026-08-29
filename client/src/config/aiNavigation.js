import {
  FaBrain,
  FaChartLine,
  FaPoundSign,
  FaBriefcase,
  FaPenFancy,
  FaHome,
  FaComments,
  FaHistory,
  FaTags,
  FaThLarge,
} from 'react-icons/fa';

/** Live navigation only — no "Soon" placeholders in the product shell */
export const AI_NAV = [
  {
    group: 'Start',
    items: [
      { to: '/ai-services', label: 'Intelligence Hub', icon: FaThLarge, exact: true },
    ],
  },
  {
    group: 'Analyse',
    items: [
      { to: '/ai-services/property-intelligence', label: 'Property Intelligence', icon: FaBrain },
      { to: '/ai-services/investment-analyst', label: 'Investment Analyst', icon: FaChartLine },
      { to: '/ai-services/rent-intelligence', label: 'Rent Intelligence', icon: FaPoundSign },
      { to: '/ai-services/portfolio-optimiser', label: 'Portfolio Optimiser', icon: FaBriefcase },
    ],
  },
  {
    group: 'Marketing tools',
    items: [
      { to: '/ai-services/listing-writer', label: 'Listing Writer', icon: FaPenFancy },
      { to: '/ai-services/valuation', label: 'Valuation', icon: FaHome },
      { to: '/ai-services/buyer-match', label: 'Buyer Match', icon: FaComments },
    ],
  },
  {
    group: 'Account',
    items: [
      { to: '/ai-services/history', label: 'Analysis history', icon: FaHistory },
      { to: '/ai-services/pricing', label: 'Credits & pricing', icon: FaTags },
    ],
  },
];

export const AI_PLATFORM_TAGLINE =
  'Evidence-first property intelligence for UK listings.';

export const AI_PRODUCT_NAME = 'Property Intelligence';
