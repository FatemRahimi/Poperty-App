import {
  FaChartLine,
  FaPoundSign,
  FaBriefcase,
  FaPenFancy,
  FaHome,
  FaComments,
  FaHistory,
  FaUser,
  FaThLarge,
  FaTachometerAlt,
} from 'react-icons/fa';

/** Live navigation only — no "Soon" placeholders in the product shell. */
export const AI_NAV = [
  {
    group: 'Start',
    items: [
      { to: '/ai-services', label: 'Home', icon: FaThLarge, exact: true },
      { to: '/ai-services/history', label: 'Property cases', icon: FaHistory },
    ],
  },
  {
    group: 'Account',
    items: [
      { to: '/ai-services/pricing', label: 'Account', icon: FaUser },
    ],
  },
  {
    group: 'More tools',
    disclosure: true,
    items: [
      { to: '/ai-services/portfolio-optimiser', label: 'Portfolio', icon: FaBriefcase },
      { to: '/ai-services/investment-analyst', label: 'Investment Analyst', icon: FaChartLine },
      { to: '/ai-services/rent-intelligence', label: 'Rent Intelligence', icon: FaPoundSign },
      { to: '/ai-services/valuation', label: 'Valuation', icon: FaHome },
      { to: '/ai-services/listing-writer', label: 'Listing Writer', icon: FaPenFancy },
      { to: '/ai-services/buyer-match', label: 'Buyer Match', icon: FaComments },
      { to: '/ai-services/dashboard', label: 'Activity', icon: FaTachometerAlt },
    ],
  },
];

export const AI_PLATFORM_TAGLINE = '';

export const AI_PRODUCT_NAME = 'Property Intelligence';
