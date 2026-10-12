import React, { useState } from 'react';
import { useNMO } from '../context/NMOContext';
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  ShieldCheck,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  User,
  Building,
  HelpCircle,
  FileText,
  Sparkles,
  ArrowRight,
  RefreshCw,
  ExternalLink,
  ChevronDown,
  Info
} from 'lucide-react';
import { NmoLogo } from './NmoLogo';

const CATEGORIES = [
  'Membership Inquiry',
  'Technical Support',
  'Event & Activities',
  'Profile & Membership Correction',
  'Feedback & Suggestions',
  'Report an Issue',
  'Other'
] as const;

type InquiryCategory = (typeof CATEGORIES)[number];

interface ContactFormState {
  fullName: string;
  mobile: string;
  membershipId: string;
  email: string;
  city: string;
  category: InquiryCategory;
  subject: string;
  message: string;
  website_hp: string; // Honeypot field for spam bots
}

interface ApiResponse {
  success: boolean;
  inquiryId?: string;
  recipient?: string;
  emailDelivered?: boolean;
  emailConfigured?: boolean;
  emailError?: string;
  timestamp?: string;
  message?: string;
  error?: string;
}

interface ContactUsPageProps {
  onNavigateHome?: () => void;
  onNavigate?: (tab: string) => void;
}

export const ContactUsPage: React.FC<ContactUsPageProps> = ({
  onNavigateHome,
  onNavigate
}) => {
  const { cities } = useNMO();

  const [formData, setFormData] = useState<ContactFormState>({
    fullName: '',
    mobile: '',
    membershipId: '',
    email: '',
    city: '',
    category: 'Membership Inquiry',
    subject: '',
    message: '',
    website_hp: ''
  });

  const [citySuggestions, setCitySuggestions] = useState<string[]>([]);
  const [showCityDropdown, setShowCityDropdown] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<ApiResponse | null>(null);
  const [copiedId, setCopiedId] = useState(false);

  // Filter city suggestions
  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setFormData((prev) => ({ ...prev, city: val }));
    if (val.trim().length > 0 && cities?.length) {
      const filtered = cities
        .filter((c) => c.toLowerCase().includes(val.toLowerCase()))
        .slice(0, 6);
      setCitySuggestions(filtered);
      setShowCityDropdown(filtered.length > 0);
    } else {
      setCitySuggestions([]);
      setShowCityDropdown(false);
    }
  };

  const handleSelectCity = (city: string) => {
    setFormData((prev) => ({ ...prev, city }));
    setShowCityDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Client-side quick check
    if (!formData.fullName.trim()) {
      setFormError('Full Name is required.');
      return;
    }
    const cleanMobile = formData.mobile.trim().replace(/[\s\-]/g, '');
    if (!cleanMobile || !/^[+]?[0-9]{10,15}$/.test(cleanMobile)) {
      setFormError('Please enter a valid 10 to 15 digit mobile number.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setFormError('Please provide a valid email address.');
      return;
    }
    if (!formData.city.trim()) {
      setFormError('City / District is required.');
      return;
    }
    if (!formData.subject.trim()) {
      setFormError('Subject is required.');
      return;
    }
    if (!formData.message.trim() || formData.message.trim().length < 10) {
      setFormError('Please write a message of at least 10 characters.');
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || !data.success) {
        // PRESERVE form data on failure
        setFormError(data.error || 'Failed to submit inquiry. Please try again.');
        setIsSubmitting(false);
        return;
      }

      // Success
      setSubmissionResult(data);
      setFormError(null);
    } catch (err: any) {
      // PRESERVE form data on failure
      console.error('Contact submission error:', err);
      setFormError('A network error occurred. Your form inputs have been preserved. Please check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setFormData({
      fullName: '',
      mobile: '',
      membershipId: '',
      email: '',
      city: '',
      category: 'Membership Inquiry',
      subject: '',
      message: '',
      website_hp: ''
    });
    setSubmissionResult(null);
    setFormError(null);
  };

  const copyInquiryId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  return (
    <div className="bg-slate-50 text-slate-800 py-10 px-4 sm:px-6 lg:px-8 min-h-screen">
      {/* Top Banner & Header */}
      <div className="max-w-7xl mx-auto mb-10">
        <div className="bg-gradient-to-r from-red-800 via-orange-700 to-amber-700 rounded-3xl p-8 sm:p-12 text-white shadow-xl relative overflow-hidden border border-orange-500/20">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/15 backdrop-blur-md text-amber-200 text-xs font-semibold mb-4 border border-white/10">
              <Sparkles className="w-3.5 h-3.5" />
              <span>॥ प्राणिनाम् आर्तिनाशनम् ॥ • Official NMO Gujarat Secretariat</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white mb-4">
              Contact Us & Helpdesk
            </h1>
            <p className="text-sm sm:text-base text-amber-100 leading-relaxed max-w-2xl">
              Have a membership question, CME registration inquiry, certificate correction, or institutional request? Reach our administrative team directly. Inquiries are routed to the central secretariat at <strong className="text-white underline decoration-amber-300">devanshshah768@gmail.com</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side: Information & Secretariat Details (5 Columns) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Key Routing Notice Card */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-lg shadow-slate-900/5 border border-amber-200/80 bg-gradient-to-b from-amber-50/50 to-white">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Direct Recipient</h3>
                <p className="text-xs text-slate-500">Fixed administrative routing</p>
              </div>
            </div>
            <div className="p-3.5 rounded-2xl bg-amber-100/60 border border-amber-200 text-xs text-amber-950 font-medium space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>Primary Destination: <strong>devanshshah768@gmail.com</strong></span>
              </div>
              <p className="text-[11px] text-amber-800/80 pl-4">
                Submissions automatically format sender credentials, mobile, membership ID, and timestamp into an official dispatch notice.
              </p>
            </div>
          </div>

          {/* Contact Directory */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-lg shadow-slate-900/5 border border-slate-200/80">
            <h3 className="font-bold text-slate-900 text-base mb-4 flex items-center gap-2">
              <Building className="w-4 h-4 text-red-700" />
              <span>State Headquarters & Secretariat</span>
            </h3>

            <div className="space-y-4 text-xs text-slate-600">
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 block">NMO Gujarat State Office</span>
                  <p className="text-slate-500 text-[11px] leading-relaxed">
                    Opp. B.J. Medical College, Civil Hospital Campus, Asarwa, Ahmedabad, Gujarat — 380016
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 block">General Helpline</span>
                  <p className="text-slate-500 text-[11px]">+91 79 2658 0000 / +91 94280 12345</p>
                  <p className="text-[10px] text-slate-400">Available Mon–Sat: 10:00 AM – 6:00 PM IST</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-slate-800 block">Response Standard</span>
                  <p className="text-slate-500 text-[11px]">
                    Inquiries are categorized and addressed within 24 to 48 working hours by the state secretary committee.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Categories Reference Guide */}
          <div className="bg-white rounded-3xl p-6 sm:p-7 shadow-lg shadow-slate-900/5 border border-slate-200/80">
            <h3 className="font-bold text-slate-900 text-base mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-amber-600" />
              <span>Inquiry Categories Guide</span>
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Select the most applicable category so your request reaches the right committee member:
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800 text-[11px] text-red-700">Membership Inquiry:</span>
                <span className="text-slate-600 text-[11px] block mt-0.5">Registration status, state council verification, new enrollment.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800 text-[11px] text-blue-700">Technical Support:</span>
                <span className="text-slate-600 text-[11px] block mt-0.5">Login issues, digital ID card QR scan, password reset.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800 text-[11px] text-emerald-700">Event & Activities:</span>
                <span className="text-slate-600 text-[11px] block mt-0.5">Upcoming CMEs, Seva camps, conference participation.</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <span className="font-bold text-slate-800 text-[11px] text-orange-700">Profile & Correction:</span>
                <span className="text-slate-600 text-[11px] block mt-0.5">Spelling updates, medical college / hospital changes, phone/email correction.</span>
              </div>
            </div>
          </div>

          {/* Privacy & Anti-Spam Guarantee */}
          <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-lg flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-bold text-slate-100 block">Security & Spam Protection</span>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                No user login required. Submissions undergo server-side rate-limiting and duplicate validation to maintain official integrity.
              </p>
            </div>
          </div>
        </div>

        {/* Right Side: The Interactive Contact Form (7 Columns) */}
        <div className="lg:col-span-7">
          <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-xl shadow-slate-900/5 border border-orange-200/60 relative">
            {/* Top Accent Strip */}
            <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-red-700 via-orange-600 to-amber-500 rounded-t-3xl" />

            {/* Submission Success State */}
            {submissionResult ? (
              <div className="py-8 space-y-6 animate-in fade-in duration-300">
                <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 className="w-10 h-10" />
                </div>

                <div className="text-center space-y-2">
                  <h2 className="text-2xl font-extrabold text-slate-900">
                    Inquiry Submitted Successfully
                  </h2>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    Your inquiry has been recorded and processed by the NMO Gujarat server.
                  </p>
                </div>

                {/* Reference ID Card */}
                {submissionResult.inquiryId && (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-center max-w-md mx-auto">
                    <span className="text-xs uppercase font-bold text-slate-400 block mb-1">
                      Official Reference ID
                    </span>
                    <div className="flex items-center justify-center gap-2">
                      <span className="font-mono text-base font-extrabold text-red-700">
                        {submissionResult.inquiryId}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyInquiryId(submissionResult.inquiryId!)}
                        className="px-2 py-1 text-[11px] bg-white border border-slate-300 rounded-md hover:bg-slate-100 text-slate-700 cursor-pointer font-medium"
                      >
                        {copiedId ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Honest Email Delivery Status Card */}
                <div className={`p-4 rounded-2xl border text-xs leading-relaxed max-w-md mx-auto ${
                  submissionResult.emailDelivered
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                    : submissionResult.emailConfigured
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-orange-50 border-orange-200 text-orange-950'
                }`}>
                  <div className="font-bold flex items-center gap-1.5 mb-1">
                    <Info className="w-4 h-4 shrink-0" />
                    <span>Email Delivery Status:</span>
                  </div>
                  {submissionResult.emailDelivered ? (
                    <p>
                      Dispatched directly via server SMTP to <strong>{submissionResult.recipient || 'devanshshah768@gmail.com'}</strong>.
                    </p>
                  ) : submissionResult.emailConfigured ? (
                    <p>
                      Inquiry recorded on server. Outgoing SMTP dispatch reported: <em>{submissionResult.emailError || 'Server error delivering email'}</em>.
                    </p>
                  ) : (
                    <p>
                      Inquiry securely logged in the system. Note: Outgoing SMTP/Gmail delivery is pending credentials configuration on the host server.
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="w-full sm:w-auto px-6 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-semibold text-xs hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Submit Another Inquiry</span>
                  </button>
                  {onNavigateHome && (
                    <button
                      type="button"
                      onClick={onNavigateHome}
                      className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-red-700 hover:bg-red-800 text-white font-semibold text-xs shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Return to Home</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* The Form */
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    Submit an Inquiry
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1">
                    Please provide accurate information so our secretariat can verify and respond promptly.
                  </p>
                </div>

                {/* Error Banner (Preserves Form Data!) */}
                {formError && (
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs flex items-start gap-3 animate-in shake duration-200">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold">Unable to submit inquiry:</span>
                      <p>{formError}</p>
                    </div>
                  </div>
                )}

                {/* Honeypot field (hidden from genuine users) */}
                <div className="hidden" aria-hidden="true">
                  <label htmlFor="website_hp">Leave this empty</label>
                  <input
                    type="text"
                    id="website_hp"
                    name="website_hp"
                    value={formData.website_hp}
                    onChange={(e) => setFormData((prev) => ({ ...prev, website_hp: e.target.value }))}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {/* Row 1: Full Name & Mobile Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Full Name <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dr. Aakash Patel"
                        value={formData.fullName}
                        onChange={(e) => setFormData((prev) => ({ ...prev, fullName: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                      />
                      <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Mobile Number <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="tel"
                        required
                        placeholder="e.g. +91 98765 43210"
                        value={formData.mobile}
                        onChange={(e) => setFormData((prev) => ({ ...prev, mobile: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                      />
                      <Phone className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 2: Email & Membership ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Email Address <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="email"
                        required
                        placeholder="doctor@example.com"
                        value={formData.email}
                        onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Membership ID</span>
                      <span className="text-[10px] text-slate-400 font-normal lowercase">(optional)</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. NMO-GJ-2024-001"
                        value={formData.membershipId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, membershipId: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors uppercase placeholder:normal-case font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Row 3: City & Category */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* City with database autocomplete */}
                  <div className="relative">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      City / District <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        required
                        placeholder="e.g. Ahmedabad, Surat, Rajkot"
                        value={formData.city}
                        onChange={handleCityChange}
                        onFocus={() => {
                          if (formData.city.trim() && citySuggestions.length > 0) {
                            setShowCityDropdown(true);
                          }
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                      />
                      <MapPin className="w-4 h-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
                    </div>

                    {/* Suggestions dropdown from database */}
                    {showCityDropdown && citySuggestions.length > 0 && (
                      <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                          Database Cities
                        </div>
                        {citySuggestions.map((cityName) => (
                          <button
                            key={cityName}
                            type="button"
                            onClick={() => handleSelectCity(cityName)}
                            className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-orange-50 hover:text-orange-900 transition-colors cursor-pointer flex items-center justify-between"
                          >
                            <span>{cityName}</span>
                            <MapPin className="w-3 h-3 text-orange-500" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Category Dropdown */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Inquiry Category <span className="text-red-600">*</span>
                    </label>
                    <div className="relative">
                      <select
                        required
                        value={formData.category}
                        onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value as InquiryCategory }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors appearance-none bg-white cursor-pointer"
                      >
                        {CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Row 4: Subject */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Subject <span className="text-red-600">*</span></span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Output format: &quot;{formData.category} : {formData.subject || 'Subject'}&quot;
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Brief summary of your inquiry..."
                    value={formData.subject}
                    onChange={(e) => setFormData((prev) => ({ ...prev, subject: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors"
                  />
                </div>

                {/* Row 5: Message */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Message Details <span className="text-red-600">*</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      {formData.message.length} characters (min 10)
                    </span>
                  </div>
                  <textarea
                    required
                    rows={5}
                    placeholder="Provide complete details about your request, event name, transaction ID (if any), or question..."
                    value={formData.message}
                    onChange={(e) => setFormData((prev) => ({ ...prev, message: e.target.value }))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-slate-900 text-sm focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-colors resize-y"
                  />
                </div>

                {/* Submit CTA */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-700 via-orange-600 to-amber-600 hover:from-red-800 hover:via-orange-700 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-orange-600/20 transition-all duration-200 active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Validating & Dispatching Inquiry...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Submit Official Inquiry</span>
                      </>
                    )}
                  </button>
                  <p className="text-center text-[11px] text-slate-400 mt-2.5">
                    Secure transmission • Direct delivery to devanshshah768@gmail.com
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
