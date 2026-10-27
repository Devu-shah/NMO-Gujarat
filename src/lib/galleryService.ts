import { apiUrl } from './api';
import { db } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export interface GalleryPhoto {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  createdTime?: string;
  proxyUrl: string;
  webViewLink?: string;
  thumbnailLink?: string;
}

export interface GalleryEvent {
  id: string;
  eventName: string;
  category?: 'Camps' | 'CMEs' | 'Yatra' | 'Students' | 'General';
  location?: string;
  date?: string;
  photoCount: number;
  coverPhoto: GalleryPhoto | null;
  photos: GalleryPhoto[];
  createdTime?: string;
  isFeatured?: boolean;
}

export interface GalleryConfig {
  featuredEventFolderIds: string[];
  updatedAt?: string;
  updatedBy?: string;
}

// Fallback high-quality curated events if Google Drive gallery folder is still being populated
export const DEFAULT_GALLERY_EVENTS: GalleryEvent[] = [
  {
    id: 'fallback-gal-1',
    eventName: 'Free Rural & Tribal Health Camps',
    category: 'Camps',
    location: 'Dang & Coastal Saurashtra',
    date: 'Recent Mission',
    photoCount: 4,
    coverPhoto: {
      id: 'fb-img-1',
      name: 'Tribal Health Camp Dang 01.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg'
    },
    photos: [
      { id: 'fb-img-1-1', name: 'Physician Consultation Dang.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-1-2', name: 'Free Medicine Distribution.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' },
      { id: 'fb-img-1-3', name: 'Pediatric Health Screening.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' },
      { id: 'fb-img-1-4', name: 'Volunteer Medicos Team Dang.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' }
    ]
  },
  {
    id: 'fallback-gal-2',
    eventName: 'Continuing Medical Education (CME) Symposium',
    category: 'CMEs',
    location: 'State Teaching Hospitals Ahmedabad',
    date: 'Recent Academic Session',
    photoCount: 4,
    coverPhoto: {
      id: 'fb-img-2',
      name: 'State CME Inaugural Session.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg'
    },
    photos: [
      { id: 'fb-img-2-1', name: 'Clinical Faculty Keynote.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' },
      { id: 'fb-img-2-2', name: 'Emergency Resuscitation Workshop.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-2-3', name: 'Resident Doctors Discussion.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' },
      { id: 'fb-img-2-4', name: 'Certificate Conferment.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' }
    ]
  },
  {
    id: 'fallback-gal-3',
    eventName: 'Seva Yatra & Mobile Medical Unit',
    category: 'Yatra',
    location: 'Remote Forest & Coastal Villages',
    date: 'Annual Outreach',
    photoCount: 3,
    coverPhoto: {
      id: 'fb-img-3',
      name: 'Mobile Van Outreach.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg'
    },
    photos: [
      { id: 'fb-img-3-1', name: 'Mobile Clinic Arrival.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' },
      { id: 'fb-img-3-2', name: 'Village Health Assessment.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-3-3', name: 'Community Health Awareness.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' }
    ]
  },
  {
    id: 'fallback-gal-4',
    eventName: 'Undergraduate Medicos Mentorship Circle',
    category: 'Students',
    location: 'Government Medical Colleges',
    date: 'Year-Round Program',
    photoCount: 3,
    coverPhoto: {
      id: 'fb-img-4',
      name: 'Student Orientation Camp.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg'
    },
    photos: [
      { id: 'fb-img-4-1', name: 'Senior Doctor Mentorship.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' },
      { id: 'fb-img-4-2', name: 'Medical Ethics Workshop.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-4-3', name: 'Undergraduate Interactive Circle.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' }
    ]
  },
  {
    id: 'fallback-gal-5',
    eventName: 'Voluntary Blood Donation Drive',
    category: 'Camps',
    location: 'Civil Hospital Ahmedabad & Rajkot',
    date: 'State-wide Campaign',
    photoCount: 3,
    coverPhoto: {
      id: 'fb-img-5',
      name: 'Blood Donation Camp.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg'
    },
    photos: [
      { id: 'fb-img-5-1', name: 'Medical Student Donors.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-5-2', name: 'Blood Bank Storage Setup.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' },
      { id: 'fb-img-5-3', name: 'Donor Felicitation Ceremony.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' }
    ]
  },
  {
    id: 'fallback-gal-6',
    eventName: 'Preventive Nutrition & Anemia Eradication Drive',
    category: 'Students',
    location: 'Rural Community Centers',
    date: 'Public Health Wing',
    photoCount: 3,
    coverPhoto: {
      id: 'fb-img-6',
      name: 'Nutrition Awareness Program.jpg',
      mimeType: 'image/jpeg',
      proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg'
    },
    photos: [
      { id: 'fb-img-6-1', name: 'Hemoglobin Diagnostic Screening.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/backgrounds/hero-fallback.svg' },
      { id: 'fb-img-6-2', name: 'Iron & Folic Acid Distribution.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-1-healthcare-camp.svg' },
      { id: 'fb-img-6-3', name: 'Community Diet Counseling.jpg', mimeType: 'image/jpeg', proxyUrl: '/assets/nmo/hero/slide-2-medical-conference.svg' }
    ]
  }
];

/**
 * Fetch all gallery event folders and their photos from the server (which queries Google Drive root/gallery/)
 */
export async function fetchGalleryEvents(): Promise<GalleryEvent[]> {
  try {
    const res = await fetch(apiUrl('/api/gallery/events'));
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.events) && data.events.length > 0) {
        return data.events;
      }
    }
  } catch (err) {
    console.warn('Backend gallery events fetch notice:', err);
  }

  // Check Firestore Settings/galleryConfig for any custom featured selections
  try {
    const configSnap = await getDoc(doc(db, 'Settings', 'galleryConfig'));
    if (configSnap.exists()) {
      const config = configSnap.data() as GalleryConfig;
      if (config.featuredEventFolderIds && config.featuredEventFolderIds.length > 0) {
        const featuredSet = new Set(config.featuredEventFolderIds);
        return DEFAULT_GALLERY_EVENTS.map((e) => ({
          ...e,
          isFeatured: featuredSet.has(e.id)
        }));
      }
    }
  } catch {}

  return DEFAULT_GALLERY_EVENTS;
}

/**
 * Fetch photos specifically for an event folder from server
 */
export async function fetchGalleryEventPhotos(folderId: string): Promise<GalleryPhoto[]> {
  try {
    const res = await fetch(apiUrl(`/api/gallery/event/${encodeURIComponent(folderId)}/photos`));
    if (res.ok) {
      const data = await res.json();
      if (data?.success && Array.isArray(data.photos)) {
        return data.photos;
      }
    }
  } catch (err) {
    console.warn('Backend event photos fetch notice:', err);
  }

  const matched = DEFAULT_GALLERY_EVENTS.find((e) => e.id === folderId);
  return matched?.photos || [];
}

/**
 * Super Admin only: Save featured event folder IDs for Homepage showcase (max 6)
 */
export async function saveFeaturedGalleryEvents(
  featuredFolderIds: string[],
  adminEmail?: string
): Promise<boolean> {
  const cleanIds = (featuredFolderIds || []).slice(0, 6);

  try {
    // 1. Direct Firestore save to Settings/galleryConfig
    await setDoc(doc(db, 'Settings', 'galleryConfig'), {
      featuredEventFolderIds: cleanIds,
      updatedAt: new Date().toISOString(),
      updatedBy: adminEmail || 'super_admin'
    }, { merge: true });

    // 2. Sync with backend
    await fetch(apiUrl('/api/gallery/featured'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-role': 'super_admin'
      },
      body: JSON.stringify({ featuredFolderIds: cleanIds })
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error('Error saving featured gallery events:', err);
    return false;
  }
}

/**
 * Read featured gallery configuration from Firestore
 */
export async function getGalleryConfig(): Promise<GalleryConfig | null> {
  try {
    const snap = await getDoc(doc(db, 'Settings', 'galleryConfig'));
    if (snap.exists()) {
      return snap.data() as GalleryConfig;
    }
  } catch (err) {
    console.warn('Notice reading gallery config:', err);
  }
  return null;
}
