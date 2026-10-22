"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    User,
    Package,
    Heart,
    Camera,
    LogOut,
    Edit3,
    Save,
    ArrowLeft,
    Lock,
    Home,
    Truck,
    CreditCard,
    Search,
    Check,
    Clock,
    Map,
    Trash2,
    XCircle,
} from "lucide-react";
import { getOrderCancelEligibility } from "@/lib/order-cancel";
import { OrderCancelModal, type OrderCancelModalOrder } from "@/components/ui/order-cancel-modal";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { authAPI, cartAPI, orderAPI } from "@/lib/api";
import { useWishlist, wishlistBuildImageUrl } from "@/context/WishlistContext";
import { pickShopCardPath } from "@/lib/product-card-images";
import { getProductShopPath } from "@/lib/product-slugs";
import { IndianStateSelect } from "@/components/ui/indian-state-select";
import { usePincodeAutofill } from "@/lib/address/use-pincode-autofill";

/* ------------------------------------------------------------------
   Design tokens — matches the Contact page (blush bg, frosted card,
   pink letter-spaced labels, plum serif headings, underline inputs)
------------------------------------------------------------------- */
const SERIF = '"Cormorant Garamond", Georgia, "Times New Roman", serif';

const labelCls = "block text-[11px] font-medium uppercase tracking-[0.2em] text-[#d14d86]";
const inputCls =
    "w-full bg-transparent border-0 border-b border-[#ead9e0] rounded-none px-0 py-3 text-[15px] text-[#3f2430] placeholder:text-[#b9a6ae] outline-none focus:border-[#d14d86] focus:ring-0 transition-colors disabled:text-[#8a7480] disabled:cursor-not-allowed";
const btnPrimary =
    "inline-flex items-center justify-center gap-2.5 rounded-full bg-gradient-to-r from-[#f59ac0] to-[#e8609d] px-8 py-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-white shadow-[0_16px_30px_-14px_rgba(232,96,157,0.8)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_36px_-14px_rgba(232,96,157,0.95)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0";
const btnGhost =
    "inline-flex items-center justify-center gap-2.5 rounded-full border border-[#ead9e0] bg-white/60 px-7 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7a2c4e] transition hover:border-[#e8609d] hover:text-[#d14d86] disabled:opacity-60";
const cardCls =
    "rounded-[28px] border border-white/90 bg-white/55 backdrop-blur-xl shadow-[0_40px_90px_-50px_rgba(122,44,78,0.45)]";

const tabMotion = {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
    transition: { duration: 0.25 },
};

type Msg = { type: "success" | "error"; text: string } | null;
type Addr = { address: string; state: string; city: string; pincode: string };
type TrackStep = { title: string; date: string; completed: boolean };

/* ------------------------------ small UI ------------------------------ */
function SectionHead({
    eyebrow,
    title,
    desc,
    action,
}: {
    eyebrow: string;
    title: string;
    desc?: string;
    action?: React.ReactNode;
}) {
    return (
        <div className="mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
                <p className={labelCls}>{eyebrow}</p>
                <h2
                    className="mt-3 text-[30px] leading-tight text-[#7a2c4e] sm:text-[38px]"
                    style={{ fontFamily: SERIF, fontWeight: 500 }}
                >
                    {title}
                </h2>
                {desc && <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#8a7480]">{desc}</p>}
            </div>
            {action}
        </div>
    );
}

function Notice({ message }: { message: Msg }) {
    if (!message) return null;
    return (
        <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className={`mb-8 rounded-2xl border px-4 py-3 text-sm ${
                message.type === "success"
                    ? "border-emerald-100 bg-emerald-50/70 text-emerald-800"
                    : "border-rose-100 bg-rose-50/80 text-rose-700"
            }`}
        >
            {message.text}
        </motion.div>
    );
}

function Spinner({ light = true }: { light?: boolean }) {
    return (
        <span
            className={`h-4 w-4 animate-spin rounded-full border-2 ${
                light ? "border-white/40 border-t-white" : "border-[#f3d3e1] border-t-[#d14d86]"
            }`}
        />
    );
}

function EmptyState({
    icon: Icon,
    title,
    text,
    cta,
}: {
    icon: React.ElementType;
    title: string;
    text: string;
    cta?: React.ReactNode;
}) {
    return (
        <div className="flex flex-col items-center py-16 text-center">
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#fdeef4] text-[#e8609d]">
                <Icon className="h-7 w-7" />
            </div>
            <h3 className="text-2xl text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                {title}
            </h3>
            <p className="mt-2 max-w-sm text-sm text-[#8a7480]">{text}</p>
            {cta && <div className="mt-8">{cta}</div>}
        </div>
    );
}

/* ------------------------- tracking timeline ------------------------- */
const EASE: [number, number, number, number] = [0.65, 0, 0.35, 1];

function Vehicle({ duration, delivered, vertical }: { duration: number; delivered: boolean; vertical?: boolean }) {
    const hops = Math.max(2, Math.round(duration / 0.3));
    return (
        <div className="relative" style={vertical ? { transform: "rotate(90deg) scaleY(-1)" } : undefined}>
            {/* speed lines while driving */}
            <motion.div
                className="pointer-events-none absolute right-full top-1/2 mr-1.5 flex -translate-y-1/2 flex-col items-end gap-[3px]"
                initial={{ opacity: 1 }}
                animate={{ opacity: 0 }}
                transition={{ delay: duration, duration: 0.4 }}
            >
                {[14, 9, 12].map((w, i) => (
                    <motion.span
                        key={i}
                        className="block h-[2px] rounded-full bg-[#ec6fa7]"
                        style={{ width: w }}
                        animate={{ x: [4, -6], opacity: [0, 0.9, 0] }}
                        transition={{ duration: 0.45, repeat: Infinity, delay: i * 0.12, ease: "linear" }}
                    />
                ))}
            </motion.div>

            {/* the truck (bumps along the road, settles on arrival) */}
            <motion.div
                animate={{ y: [0, -2.5, 0] }}
                transition={{ duration: 0.3, repeat: hops, ease: "easeInOut" }}
                className="flex h-9 w-12 items-center justify-center rounded-xl bg-white text-[#d14d86] shadow-[0_10px_24px_-10px_rgba(209,77,134,0.7)] ring-1 ring-[#f6dbe6]"
            >
                <Truck className="h-5 w-5" />
            </motion.div>
            <span className="absolute left-1/2 top-full -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent border-t-white" />

            {delivered && (
                <motion.span
                    className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white shadow"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: duration, type: "spring", stiffness: 400, damping: 15 }}
                >
                    <Check className="h-3 w-3" strokeWidth={3} />
                </motion.span>
            )}
        </div>
    );
}

function StepDot({ completed, delay, current }: { completed: boolean; delay: number; current: boolean }) {
    return (
        <div className="relative z-10 h-10 w-10 shrink-0">
            {current && (
                <motion.span
                    className="absolute inset-0 rounded-full bg-[#ec6fa7]/30"
                    initial={{ scale: 1, opacity: 0 }}
                    animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
                    transition={{ delay, duration: 1.6, repeat: Infinity, ease: "easeOut" }}
                />
            )}
            <div className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-white bg-[#f3e2ea] text-[#c9b3bd] shadow-sm">
                <Clock className="h-4 w-4" />
            </div>
            {completed && (
                <motion.div
                    className="absolute inset-0 flex items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-[#f59ac0] to-[#d14d86] text-white shadow-[0_8px_18px_-8px_rgba(209,77,134,0.8)]"
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.15, 1], opacity: 1 }}
                    transition={{ delay, duration: 0.45 }}
                >
                    <Check className="h-4 w-4" strokeWidth={3} />
                </motion.div>
            )}
        </div>
    );
}

function TrackingTimeline({ steps, status }: { steps: TrackStep[]; status?: string }) {
    const n = steps.length;
    const doneIdx = steps.reduce((acc, s, i) => (s.completed ? i : acc), 0);
    const pct = n > 1 ? doneIdx / (n - 1) : 1;
    const duration = Math.max(0.8, 2.6 * pct);
    const delivered = status === "delivered";
    const stepDelay = (i: number) => (doneIdx > 0 ? duration * (i / doneIdx) : 0);
    const fillCls = "bg-gradient-to-r from-[#f7a8c9] via-[#ec6fa7] to-[#d14d86]";

    return (
        <>
            {/* Desktop — horizontal road */}
            <div className="relative hidden pt-16 sm:block">
                <div className="absolute h-[3px]" style={{ top: 82.5, left: `${50 / n}%`, right: `${50 / n}%` }}>
                    <div className="absolute inset-0 rounded-full bg-[#f3e2ea]" />
                    <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${fillCls}`}
                        initial={{ width: "0%" }}
                        animate={{ width: `${pct * 100}%` }}
                        transition={{ duration, ease: EASE }}
                    />
                    <motion.div
                        className="absolute bottom-[28px]"
                        style={{ x: "-50%" }}
                        initial={{ left: "0%" }}
                        animate={{ left: `${pct * 100}%` }}
                        transition={{ duration, ease: EASE }}
                    >
                        <Vehicle duration={duration} delivered={delivered} />
                    </motion.div>
                </div>

                <div className="relative flex">
                    {steps.map((s, i) => (
                        <div key={i} className="flex flex-1 flex-col items-center px-2 text-center">
                            <StepDot completed={s.completed} delay={stepDelay(i)} current={i === doneIdx && !delivered} />
                            <p className={`mt-4 text-[11px] font-semibold uppercase tracking-[0.16em] ${s.completed ? "text-[#3f2430]" : "text-[#b9a6ae]"}`}>
                                {s.title}
                            </p>
                            <p className="mt-1 text-xs text-[#8a7480]">{s.date}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Mobile — vertical road */}
            <div className="relative pl-16 sm:hidden">
                <div className="absolute w-[3px]" style={{ left: 82.5, top: 20, bottom: 20 }}>
                    <div className="absolute inset-0 rounded-full bg-[#f3e2ea]" />
                    <motion.div
                        className="absolute inset-x-0 top-0 rounded-full bg-gradient-to-b from-[#f7a8c9] via-[#ec6fa7] to-[#d14d86]"
                        initial={{ height: "0%" }}
                        animate={{ height: `${pct * 100}%` }}
                        transition={{ duration, ease: EASE }}
                    />
                    <motion.div
                        className="absolute right-[22px]"
                        style={{ y: "-50%" }}
                        initial={{ top: "0%" }}
                        animate={{ top: `${pct * 100}%` }}
                        transition={{ duration, ease: EASE }}
                    >
                        <Vehicle duration={duration} delivered={delivered} vertical />
                    </motion.div>
                </div>

                <div className="flex flex-col gap-8">
                    {steps.map((s, i) => (
                        <div key={i} className="flex min-h-10 items-center gap-4">
                            <StepDot completed={s.completed} delay={stepDelay(i)} current={i === doneIdx && !delivered} />
                            <div>
                                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${s.completed ? "text-[#3f2430]" : "text-[#b9a6ae]"}`}>
                                    {s.title}
                                </p>
                                <p className="mt-0.5 text-xs text-[#8a7480]">{s.date}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

/* -------------------------------- page -------------------------------- */
export default function ProfilePage() {
    return (
        <React.Suspense
            fallback={
                <div className="flex min-h-screen items-center justify-center bg-[#fdf4f7]">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f3d3e1] border-t-[#d14d86]" />
                </div>
            }
        >
            <ProfileContent />
        </React.Suspense>
    );
}

function ProfileContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { items: wishlistItems, loading: wishlistLoading, removeFromWishlist } = useWishlist();
    const [activeTab, setActiveTab] = useState("profile");
    const [isEditing, setIsEditing] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saveLoading, setSaveLoading] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [message, setMessage] = useState<Msg>(null);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
    const [trackingId, setTrackingId] = useState("");
    const [trackResult, setTrackResult] = useState<any>(null);
    const [trackLoading, setTrackLoading] = useState(false);
    const [orders, setOrders] = useState<any[]>([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);
    const [cancelModalOrder, setCancelModalOrder] = useState<OrderCancelModalOrder | null>(null);
    const emptyAddr = (): Addr => ({ address: "", state: "", city: "", pincode: "" });
    const [userData, setUserData] = useState<{
        name: string;
        email: string;
        phone: string;
        address: string;
        avatar: string;
        billingAddress: Addr;
        shippingAddress: Addr;
    }>({
        name: "",
        email: "",
        phone: "",
        address: "",
        avatar: "",
        billingAddress: emptyAddr(),
        shippingAddress: emptyAddr(),
    });

    const formatCurrency = (amount: number) =>
        new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount || 0);
    const getProductHref = (product: { id?: string; name?: string; _id?: string }) => getProductShopPath(product);

    const buildTrackResult = (o: any) => {
        const statusOrder = ["created", "confirmed", "processing", "shipped", "delivered"];
        const currentIndex = Math.max(0, statusOrder.indexOf(o.status));
        return {
            id: o.orderNumber || o._id,
            status: o.status,
            expectedDelivery: o.status === "delivered" ? "Delivered" : "In Progress",
            steps: [
                { title: "Order Placed", date: new Date(o.createdAt).toLocaleString(), completed: currentIndex >= 0 },
                { title: "Confirmed", date: currentIndex >= 1 ? "Completed" : "Pending", completed: currentIndex >= 1 },
                { title: "Processing", date: currentIndex >= 2 ? "Completed" : "Pending", completed: currentIndex >= 2 },
                { title: "Shipped", date: currentIndex >= 3 ? "Completed" : "Pending", completed: currentIndex >= 3 },
                { title: "Delivered", date: currentIndex >= 4 ? "Completed" : "Pending", completed: currentIndex >= 4 },
            ],
        };
    };

    const fetchOrders = async () => {
        setOrdersLoading(true);
        try {
            const res = await orderAPI.getMyOrders();
            setOrders(res?.success ? res.data || [] : []);
        } catch {
            setOrders([]);
        } finally {
            setOrdersLoading(false);
        }
    };

    const openCancelModal = (order: {
        _id: string;
        orderNumber?: string;
        status?: string;
        createdAt?: string;
        total?: number;
    }) => {
        const eligibility = getOrderCancelEligibility(order);
        if (!eligibility.canCancel) {
            setMessage({ type: "error", text: eligibility.reason || "This order cannot be cancelled." });
            return;
        }
        setCancelModalOrder({
            _id: order._id,
            orderNumber: order.orderNumber,
            total: order.total,
            createdAt: order.createdAt,
        });
    };

    const confirmCancelOrder = async () => {
        if (!cancelModalOrder) return;
        setCancellingOrderId(cancelModalOrder._id);
        setMessage(null);
        try {
            const res = await orderAPI.cancelMyOrder(cancelModalOrder._id);
            if (res?.success) {
                setMessage({ type: "success", text: res.message || "Order cancelled successfully." });
                setCancelModalOrder(null);
                await fetchOrders();
            } else {
                throw new Error(res?.message || "Could not cancel order");
            }
        } catch (err: any) {
            setMessage({ type: "error", text: err.message || "Could not cancel order" });
        } finally {
            setCancellingOrderId(null);
        }
    };

    const formatCancelTimeLeft = (deadline?: Date) => {
        if (!deadline) return "";
        const ms = deadline.getTime() - Date.now();
        if (ms <= 0) return "";
        const hours = Math.floor(ms / (60 * 60 * 1000));
        const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        if (hours > 0) return `${hours}h ${minutes}m left to cancel`;
        return `${minutes}m left to cancel`;
    };

    useEffect(() => {
        const validTabs = new Set(["profile", "security", "addresses", "orders", "track-order", "wishlist"]);
        const tab = searchParams.get("tab");
        setActiveTab(tab && validTabs.has(tab) ? tab : "profile");
        const track = searchParams.get("track");
        if (track) setTrackingId(track);
    }, [searchParams]);

    useEffect(() => {
        if (activeTab === "orders") fetchOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const { lookupNow: lookupBillingPincode } = usePincodeAutofill(
        userData.billingAddress?.pincode ?? "",
        (state, city) => {
            setUserData((prev) => ({
                ...prev,
                billingAddress: {
                    ...(prev.billingAddress ?? emptyAddr()),
                    ...(state ? { state } : {}),
                    ...(city ? { city } : {}),
                },
            }));
        },
        { enabled: activeTab === "addresses" }
    );

    const { lookupNow: lookupShippingPincode } = usePincodeAutofill(
        userData.shippingAddress?.pincode ?? "",
        (state, city) => {
            setUserData((prev) => ({
                ...prev,
                shippingAddress: {
                    ...(prev.shippingAddress ?? emptyAddr()),
                    ...(state ? { state } : {}),
                    ...(city ? { city } : {}),
                },
            }));
        },
        { enabled: activeTab === "addresses" }
    );

    useEffect(() => {
        const tab = searchParams.get("tab");
        const track = searchParams.get("track");
        if (tab === "track-order" && track) {
            (async () => {
                setTrackLoading(true);
                try {
                    const res = await orderAPI.trackMyOrder(track);
                    if (res?.success && res?.data) setTrackResult(buildTrackResult(res.data));
                } finally {
                    setTrackLoading(false);
                }
            })();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const toAddr = (a?: { address?: string; state?: string; city?: string; pincode?: string }): Addr =>
        a ? { address: a.address || "", state: a.state || "", city: a.city || "", pincode: a.pincode || "" } : emptyAddr();

    useEffect(() => {
        authAPI
            .getMe()
            .then((res) => {
                if (res.success && res.data) {
                    const u = res.data;
                    setUserData({
                        name: u.name || "",
                        email: u.email || "",
                        phone: (u.phone && String(u.phone).replace(/\D/g, "").slice(-10)) || "",
                        address: u.address || "",
                        avatar: u.avatar || "",
                        billingAddress: toAddr(u.billingAddress as any),
                        shippingAddress: toAddr(u.shippingAddress as any),
                    });
                    fetchOrders();
                }
            })
            .catch(() => router.push("/login"))
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [router]);

    const tabs = [
        { id: "profile", label: "My Profile", icon: User },
        { id: "security", label: "Security & Password", icon: Lock },
        { id: "addresses", label: "Billing & Shipping", icon: Home },
        { id: "orders", label: "My Orders", icon: Package },
        { id: "track-order", label: "Track Order", icon: Map },
        { id: "wishlist", label: "Wishlist", icon: Heart },
    ];

    const selectTab = (id: string) => {
        setActiveTab(id);
        setMessage(null);
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.dispatchEvent(new Event("userLoggedOut"));
        router.push("/");
    };

    const handleTrackOrder = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!trackingId.trim()) return;
        setTrackLoading(true);
        try {
            const res = await orderAPI.trackMyOrder(trackingId.trim());
            if (!res?.success || !res?.data) throw new Error(res?.message || "Order not found");
            setTrackResult(buildTrackResult(res.data));
            setMessage(null);
        } catch (err: any) {
            setTrackResult(null);
            setMessage({ type: "error", text: err.message || "Order not found." });
        } finally {
            setTrackLoading(false);
        }
    };

    const handleSave = async () => {
        setMessage(null);
        setSaveLoading(true);
        try {
            const phoneOnly = userData.phone.replace(/\D/g, "").slice(0, 10);
            const res = await authAPI.updateProfile({
                name: userData.name.trim(),
                email: userData.email.trim(),
                phone: phoneOnly,
            });
            if (res.success && res.data) {
                const u = res.data;
                if (typeof window !== "undefined") {
                    const existing = localStorage.getItem("user");
                    let obj: Record<string, unknown> = {};
                    try {
                        if (existing) obj = JSON.parse(existing);
                    } catch {}
                    localStorage.setItem(
                        "user",
                        JSON.stringify({ ...obj, _id: u._id, name: u.name, email: u.email, phone: u.phone, role: u.role })
                    );
                    window.dispatchEvent(new Event("userLoggedIn"));
                }
                setUserData({
                    name: u.name || "",
                    email: u.email || "",
                    phone: (u.phone && String(u.phone).replace(/\D/g, "").slice(-10)) || "",
                    address: u.address || "",
                    avatar: u.avatar || "",
                    billingAddress: toAddr(u.billingAddress as any),
                    shippingAddress: toAddr(u.shippingAddress as any),
                });
                setMessage({ type: "success", text: "Profile updated successfully." });
                setIsEditing(false);
            }
        } catch (err: unknown) {
            setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update profile." });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleSaveBilling = async () => {
        setMessage(null);
        setSaveLoading(true);
        try {
            const res = await authAPI.updateProfile({ billingAddress: userData.billingAddress ?? emptyAddr() });
            if (res.success && res.data) {
                const u = res.data as { billingAddress?: Partial<Addr> };
                setUserData((prev) => ({ ...prev, billingAddress: toAddr(u.billingAddress) }));
                setMessage({ type: "success", text: "Billing address updated." });
            }
        } catch (err: unknown) {
            setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update billing address." });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleSaveShipping = async () => {
        setMessage(null);
        setSaveLoading(true);
        try {
            const res = await authAPI.updateProfile({ shippingAddress: userData.shippingAddress ?? emptyAddr() });
            if (res.success && res.data) {
                const u = res.data as { shippingAddress?: Partial<Addr> };
                setUserData((prev) => ({ ...prev, shippingAddress: toAddr(u.shippingAddress) }));
                setMessage({ type: "success", text: "Shipping address updated." });
            }
        } catch (err: unknown) {
            setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update shipping address." });
        } finally {
            setSaveLoading(false);
        }
    };

    const handleChangePassword = async () => {
        setMessage(null);
        const { currentPassword, newPassword, confirmPassword } = passwordForm;
        if (!currentPassword.trim()) return setMessage({ type: "error", text: "Enter your current password." });
        if (!newPassword.trim()) return setMessage({ type: "error", text: "Enter a new password." });
        if (newPassword.length < 6) return setMessage({ type: "error", text: "New password must be at least 6 characters." });
        if (newPassword !== confirmPassword)
            return setMessage({ type: "error", text: "New password and confirm password do not match." });
        setPasswordLoading(true);
        try {
            const res = await authAPI.changePassword({ currentPassword, newPassword });
            if (res.success) {
                setMessage({ type: "success", text: "Password updated successfully." });
                setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
            } else {
                setMessage({ type: "error", text: (res as { message?: string }).message || "Failed to update password." });
            }
        } catch (err: unknown) {
            setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update password." });
        } finally {
            setPasswordLoading(false);
        }
    };

    const initial = userData.name ? userData.name.charAt(0).toUpperCase() : "U";
    const firstName = userData.name ? userData.name.split(" ")[0] : "there";

    /* ---------- address form (billing + shipping share one layout) ---------- */
    const renderAddressForm = (kind: "billing" | "shipping") => {
        const isBilling = kind === "billing";
        const a = (isBilling ? userData.billingAddress : userData.shippingAddress) ?? emptyAddr();
        const set = (patch: Partial<Addr>) =>
            setUserData((prev) =>
                isBilling
                    ? { ...prev, billingAddress: { ...(prev.billingAddress ?? emptyAddr()), ...patch } }
                    : { ...prev, shippingAddress: { ...(prev.shippingAddress ?? emptyAddr()), ...patch } }
            );

        return (
            <div>
                <div className="mb-8 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#fdeef4] text-[#d14d86]">
                        {isBilling ? <CreditCard className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    </span>
                    <h3 className="text-xl text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                        {isBilling ? "Billing address" : "Shipping address"}
                    </h3>
                </div>

                <div className="space-y-7">
                    <div>
                        <label className={labelCls}>Address *</label>
                        <input
                            type="text"
                            value={a.address}
                            onChange={(e) => set({ address: e.target.value })}
                            className={inputCls}
                            placeholder="House no., street, area"
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-7 sm:grid-cols-2">
                        <div>
                            <label className={labelCls}>Pincode *</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                autoComplete="postal-code"
                                value={a.pincode}
                                onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                                onBlur={() => void (isBilling ? lookupBillingPincode() : lookupShippingPincode())}
                                className={inputCls}
                                placeholder="6 digits"
                            />
                        </div>
                        <div>
                            <label className={labelCls}>City *</label>
                            <input
                                type="text"
                                value={a.city}
                                onChange={(e) => set({ city: e.target.value })}
                                className={inputCls}
                                placeholder="City"
                            />
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>State *</label>
                        <IndianStateSelect
                            value={a.state}
                            onChange={(state) => set({ state })}
                            className={`${inputCls} appearance-none cursor-pointer`}
                            aria-label={isBilling ? "Billing state" : "Shipping state"}
                        />
                    </div>
                    <p className="text-xs text-[#a8939c]">City and state fill in automatically from your pincode.</p>
                </div>

                <button
                    type="button"
                    onClick={isBilling ? handleSaveBilling : handleSaveShipping}
                    disabled={saveLoading}
                    className={`${btnPrimary} mt-9`}
                >
                    {saveLoading ? <Spinner /> : isBilling ? <CreditCard className="h-4 w-4" /> : <Truck className="h-4 w-4" />}
                    {isBilling ? "Update billing" : "Update shipping"}
                </button>
            </div>
        );
    };

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[#fdf4f7]">
                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#f3d3e1] border-t-[#d14d86]" />
            </div>
        );
    }

    return (
        <div className="relative isolate min-h-screen overflow-hidden bg-gradient-to-br from-[#fdf1f5] via-[#fffafb] to-[#fcf0f5] pb-20 pt-[30px] text-[#3f2430]">
            {/* soft background glow */}
            <div className="pointer-events-none absolute -left-40 top-20 -z-10 h-[520px] w-[520px] rounded-full bg-[#f9c9dc]/35 blur-[120px]" />
            <div className="pointer-events-none absolute -right-40 top-[40%] -z-10 h-[460px] w-[460px] rounded-full bg-[#fbd9e6]/40 blur-[120px]" />

            <div className="mx-auto w-full max-w-[1400px] px-5 sm:px-8 lg:px-12">
                {/* ===== Page header (full width) ===== */}
                <motion.header
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="flex flex-col gap-6 border-b border-[#f0dfe6] py-8 md:flex-row md:items-center md:justify-between"
                >
                    <div className="flex items-center gap-5">
                        <div className="relative h-[72px] w-[72px] shrink-0">
                            <div className="relative h-full w-full overflow-hidden rounded-full bg-gradient-to-br from-[#f59ac0] to-[#d14d86] ring-4 ring-white shadow-[0_14px_30px_-14px_rgba(209,77,134,0.8)]">
                                {userData.avatar ? (
                                    <Image src={userData.avatar} alt={userData.name} fill className="object-cover" />
                                ) : (
                                    <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-white">
                                        {initial}
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                aria-label="Change photo"
                                className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-[#f0dfe6] bg-white text-[#d14d86] shadow transition-transform hover:scale-110"
                            >
                                <Camera className="h-3.5 w-3.5" />
                            </button>
                        </div>
                        <div className="min-w-0">
                            <button
                                onClick={() => router.push("/")}
                                className="mb-1 inline-flex items-center gap-1.5 text-xs text-[#8a7480] transition-colors hover:text-[#d14d86]"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" /> Back to Home
                            </button>
                            <h1
                                className="truncate text-[28px] leading-tight text-[#7a2c4e] sm:text-[34px]"
                                style={{ fontFamily: SERIF, fontWeight: 500 }}
                            >
                                Hello, {firstName}
                            </h1>
                            <p className="truncate text-sm text-[#8a7480]">{userData.email}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-8 md:gap-12">
                        <button type="button" onClick={() => selectTab("orders")} className="text-left">
                            <span className="block text-[30px] leading-none text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                                {orders.length}
                            </span>
                            <span className={`${labelCls} mt-2`}>Orders</span>
                        </button>
                        <span className="h-10 w-px bg-[#f0dfe6]" />
                        <button type="button" onClick={() => selectTab("wishlist")} className="text-left">
                            <span className="block text-[30px] leading-none text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                                {wishlistItems.length}
                            </span>
                            <span className={`${labelCls} mt-2`}>Wishlisted</span>
                        </button>
                    </div>
                </motion.header>

                {/* ===== Mobile tabs ===== */}
                <div className="-mx-5 mt-6 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => selectTab(tab.id)}
                                className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm transition ${
                                    isActive
                                        ? "border-transparent bg-gradient-to-r from-[#f59ac0] to-[#e8609d] text-white shadow-[0_10px_20px_-12px_rgba(232,96,157,0.9)]"
                                        : "border-[#ead9e0] bg-white/60 text-[#7a5a67]"
                                }`}
                            >
                                <tab.icon className="h-4 w-4" />
                                {tab.label}
                            </button>
                        );
                    })}
                    <button
                        onClick={handleLogout}
                        className="flex shrink-0 items-center gap-2 rounded-full border border-rose-100 bg-rose-50/70 px-4 py-2.5 text-sm text-rose-600"
                    >
                        <LogOut className="h-4 w-4" /> Log out
                    </button>
                </div>

                {/* ===== Body: side nav + content ===== */}
                <div className="mt-6 grid grid-cols-1 gap-10 lg:mt-10 lg:grid-cols-[250px_1fr] lg:gap-14">
                    {/* Desktop side nav */}
                    <aside className="hidden lg:block">
                        <div className="sticky top-[104px]">
                            <p className={`${labelCls} mb-4`}>Account</p>
                            <nav className="border-t border-[#f0dfe6]">
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => selectTab(tab.id)}
                                            className={`relative flex w-full items-center gap-3 border-b border-[#f0dfe6] py-4 text-left text-[15px] transition-colors ${
                                                isActive ? "font-medium text-[#7a2c4e]" : "text-[#8a7480] hover:text-[#d14d86]"
                                            }`}
                                        >
                                            {isActive && (
                                                <motion.span
                                                    layoutId="profile-nav-indicator"
                                                    className="absolute -left-4 top-1/2 h-6 w-[2px] -translate-y-1/2 rounded-full bg-[#e8609d]"
                                                />
                                            )}
                                            <tab.icon className={`h-[18px] w-[18px] ${isActive ? "text-[#d14d86]" : "text-[#c2adb6]"}`} />
                                            {tab.label}
                                        </button>
                                    );
                                })}
                                <button
                                    onClick={handleLogout}
                                    className="flex w-full items-center gap-3 py-4 text-left text-[15px] text-rose-600 transition-colors hover:text-rose-700"
                                >
                                    <LogOut className="h-[18px] w-[18px] opacity-80" />
                                    Log out
                                </button>
                            </nav>
                            <p className="mt-8 text-xs leading-relaxed text-[#a8939c]">
                                Need help with an order? Reach us at{" "}
                                <a href="mailto:support@leiraindia.com" className="text-[#d14d86] hover:underline">
                                    support@leiraindia.com
                                </a>
                            </p>
                        </div>
                    </aside>

                    {/* Content card */}
                    <main className={`${cardCls} min-h-[560px] p-6 sm:p-10 lg:p-12`}>
                        <AnimatePresence mode="wait">
                            {/* PROFILE */}
                            {activeTab === "profile" && (
                                <motion.div key="profile" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="My profile"
                                        title="Personal information"
                                        desc="Manage your personal details and how we can reach you."
                                        action={
                                            <button
                                                onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
                                                disabled={saveLoading}
                                                className={isEditing ? btnPrimary : btnGhost}
                                            >
                                                {saveLoading ? (
                                                    <Spinner />
                                                ) : isEditing ? (
                                                    <>
                                                        <Save className="h-4 w-4" /> Save details
                                                    </>
                                                ) : (
                                                    <>
                                                        <Edit3 className="h-4 w-4" /> Edit profile
                                                    </>
                                                )}
                                            </button>
                                        }
                                    />
                                    <Notice message={message} />

                                    <div className="grid grid-cols-1 gap-x-10 gap-y-9 md:grid-cols-2">
                                        <div>
                                            <label className={labelCls}>Full name</label>
                                            <input
                                                type="text"
                                                disabled={!isEditing}
                                                value={userData.name}
                                                onChange={(e) => setUserData({ ...userData, name: e.target.value })}
                                                className={inputCls}
                                                placeholder="Your name"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Email</label>
                                            <input
                                                type="email"
                                                disabled={!isEditing}
                                                value={userData.email}
                                                onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                                                className={inputCls}
                                                placeholder="you@example.com"
                                            />
                                        </div>
                                        <div>
                                            <label className={labelCls}>Phone</label>
                                            <div className="flex items-center border-b border-[#ead9e0] transition-colors focus-within:border-[#d14d86]">
                                                <span className="py-3 pr-3 text-[15px] text-[#8a7480]">+91</span>
                                                <input
                                                    type="tel"
                                                    disabled={!isEditing}
                                                    value={userData.phone}
                                                    onChange={(e) =>
                                                        setUserData({ ...userData, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })
                                                    }
                                                    placeholder="10 digit number"
                                                    maxLength={10}
                                                    className={`${inputCls} border-b-0`}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* SECURITY */}
                            {activeTab === "security" && (
                                <motion.div key="security" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="Security"
                                        title="Change your password"
                                        desc="Keep your account secure by updating your password regularly."
                                    />
                                    <div className="max-w-lg">
                                        <Notice message={message} />
                                        <div className="space-y-8">
                                            <div>
                                                <label className={labelCls}>Current password</label>
                                                <input
                                                    type="password"
                                                    value={passwordForm.currentPassword}
                                                    onChange={(e) => setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))}
                                                    placeholder="Enter your current password"
                                                    className={inputCls}
                                                    autoComplete="current-password"
                                                />
                                            </div>
                                            <div>
                                                <label className={labelCls}>New password</label>
                                                <input
                                                    type="password"
                                                    value={passwordForm.newPassword}
                                                    onChange={(e) => setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))}
                                                    placeholder="At least 6 characters"
                                                    className={inputCls}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                            <div>
                                                <label className={labelCls}>Confirm new password</label>
                                                <input
                                                    type="password"
                                                    value={passwordForm.confirmPassword}
                                                    onChange={(e) => setPasswordForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                                                    placeholder="Re-enter your new password"
                                                    className={inputCls}
                                                    autoComplete="new-password"
                                                />
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleChangePassword}
                                            disabled={passwordLoading}
                                            className={`${btnPrimary} mt-10`}
                                        >
                                            {passwordLoading ? <Spinner /> : <Lock className="h-4 w-4" />}
                                            Change password
                                        </button>
                                    </div>
                                </motion.div>
                            )}

                            {/* ADDRESSES */}
                            {activeTab === "addresses" && (
                                <motion.div key="addresses" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="Addresses"
                                        title="Billing & shipping"
                                        desc="Save your addresses for a faster checkout."
                                    />
                                    <Notice message={message} />
                                    <div className="grid grid-cols-1 gap-14 xl:grid-cols-2 xl:gap-0 xl:divide-x xl:divide-[#f0dfe6]">
                                        <div className="xl:pr-10">{renderAddressForm("billing")}</div>
                                        <div className="border-t border-[#f0dfe6] pt-14 xl:border-t-0 xl:pl-10 xl:pt-0">
                                            {renderAddressForm("shipping")}
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ORDERS */}
                            {activeTab === "orders" && (
                                <motion.div key="orders" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="Orders"
                                        title="Order history"
                                        desc="View and track your orders. You can cancel within 24 hours, before dispatch."
                                    />
                                    <Notice message={message} />

                                    {ordersLoading ? (
                                        <div className="flex justify-center py-16">
                                            <Spinner light={false} />
                                        </div>
                                    ) : orders.length === 0 ? (
                                        <EmptyState
                                            icon={Package}
                                            title="No orders yet"
                                            text="When you place an order, it will show up here."
                                            cta={
                                                <Link href="/shop" className={btnPrimary}>
                                                    Start shopping
                                                </Link>
                                            }
                                        />
                                    ) : (
                                        <div className="border-t border-[#f0dfe6]">
                                            {orders.map((order, i) => {
                                                const cancelInfo = getOrderCancelEligibility(order);
                                                const isCancelled = order.status === "cancelled";
                                                const isDelivered = order.status === "delivered";
                                                const pill = isCancelled
                                                    ? "bg-rose-50 text-rose-600 border-rose-100"
                                                    : isDelivered
                                                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                    : "bg-[#fdeef4] text-[#d14d86] border-[#f8d5e4]";
                                                return (
                                                    <motion.div
                                                        key={order._id}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="border-b border-[#f0dfe6] py-8"
                                                    >
                                                        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
                                                            <div>
                                                                <p className={labelCls}>Order</p>
                                                                <p className="mt-1 select-all text-xl text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                                                                    {order.orderNumber || order._id}
                                                                </p>
                                                            </div>
                                                            <span className={`rounded-full border px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${pill}`}>
                                                                {order.status}
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                                                            <div>
                                                                <p className={labelCls}>Date</p>
                                                                <p className="mt-2 text-[15px]">{new Date(order.createdAt).toLocaleDateString()}</p>
                                                            </div>
                                                            <div>
                                                                <p className={labelCls}>Total</p>
                                                                <p className="mt-2 text-[15px]">{formatCurrency(order.total || 0)}</p>
                                                            </div>
                                                            <div>
                                                                <p className={labelCls}>Items</p>
                                                                <p className="mt-2 text-[15px]">
                                                                    {order.items?.length || 0} {order.items?.length === 1 ? "product" : "products"}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {cancelInfo.canCancel && (
                                                            <p className="mt-5 inline-flex items-center gap-1.5 text-xs text-amber-700">
                                                                <Clock className="h-3.5 w-3.5" />
                                                                {formatCancelTimeLeft(cancelInfo.cancelDeadline)}
                                                            </p>
                                                        )}
                                                        {!cancelInfo.canCancel && !isCancelled && !isDelivered && cancelInfo.reason && (
                                                            <p className="mt-5 text-xs text-[#8a7480]">{cancelInfo.reason}</p>
                                                        )}

                                                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    setTrackingId(order.orderNumber || order._id);
                                                                    setTrackResult(buildTrackResult(order));
                                                                    selectTab("track-order");
                                                                }}
                                                                className={btnPrimary}
                                                            >
                                                                <Truck className="h-4 w-4" /> Track order
                                                            </button>
                                                            {cancelInfo.canCancel && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openCancelModal(order)}
                                                                    disabled={cancellingOrderId === order._id}
                                                                    className="inline-flex items-center justify-center gap-2.5 rounded-full border border-rose-200 bg-rose-50/70 px-7 py-3.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600 transition hover:bg-rose-100 disabled:opacity-60"
                                                                >
                                                                    {cancellingOrderId === order._id ? (
                                                                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-rose-200 border-t-rose-500" />
                                                                    ) : (
                                                                        <XCircle className="h-4 w-4" />
                                                                    )}
                                                                    Cancel order
                                                                </button>
                                                            )}
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </motion.div>
                            )}

                            {/* TRACK ORDER */}
                            {activeTab === "track-order" && (
                                <motion.div key="track-order" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="Track order"
                                        title="Where is my order?"
                                        desc="Enter your order ID to see its live status."
                                    />
                                    <Notice message={message} />

                                    <form onSubmit={handleTrackOrder} className="flex flex-col gap-6 sm:flex-row sm:items-end">
                                        <div className="flex-1">
                                            <label className={labelCls}>Order ID</label>
                                            <div className="flex items-center gap-3 border-b border-[#ead9e0] transition-colors focus-within:border-[#d14d86]">
                                                <Search className="h-4 w-4 shrink-0 text-[#c2adb6]" />
                                                <input
                                                    type="text"
                                                    value={trackingId}
                                                    onChange={(e) => setTrackingId(e.target.value)}
                                                    className={`${inputCls} border-b-0`}
                                                    placeholder="e.g. ORD-12345678"
                                                />
                                            </div>
                                        </div>
                                        <button type="submit" disabled={trackLoading || !trackingId.trim()} className={btnPrimary}>
                                            {trackLoading ? <Spinner /> : <Truck className="h-4 w-4" />}
                                            Track package
                                        </button>
                                    </form>

                                    {trackResult && (
                                        <motion.div
                                            key={trackResult.id}
                                            initial={{ opacity: 0, y: 12 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mt-12 rounded-3xl border border-[#f3e2ea] bg-white/60 p-6 sm:p-10"
                                        >
                                            <div className="mb-10 flex flex-col justify-between gap-5 border-b border-[#f0dfe6] pb-8 sm:flex-row sm:items-end">
                                                <div>
                                                    <p className={labelCls}>Tracking info</p>
                                                    <p className="mt-2 text-2xl text-[#7a2c4e]" style={{ fontFamily: SERIF, fontWeight: 500 }}>
                                                        {trackResult.id}
                                                    </p>
                                                </div>
                                                <div className="sm:text-right">
                                                    <p className={labelCls}>Expected delivery</p>
                                                    <p className="mt-2 text-lg text-[#3f2430]">{trackResult.expectedDelivery}</p>
                                                </div>
                                            </div>

                                            {trackResult.status === "cancelled" ? (
                                                <p className="rounded-2xl border border-rose-100 bg-rose-50/70 px-4 py-3 text-sm text-rose-700">
                                                    This order was cancelled.
                                                </p>
                                            ) : (
                                                <TrackingTimeline
                                                    key={`${trackResult.id}-${trackResult.status}`}
                                                    steps={trackResult.steps}
                                                    status={trackResult.status}
                                                />
                                            )}
                                        </motion.div>
                                    )}
                                </motion.div>
                            )}

                            {/* WISHLIST */}
                            {activeTab === "wishlist" && (
                                <motion.div key="wishlist" {...tabMotion}>
                                    <SectionHead
                                        eyebrow="Wishlist"
                                        title="Saved for later"
                                        desc="Products you've saved. Grab them before they go out of stock."
                                    />
                                    <Notice message={message} />

                                    {wishlistLoading ? (
                                        <div className="flex justify-center py-16">
                                            <Spinner light={false} />
                                        </div>
                                    ) : wishlistItems.length === 0 ? (
                                        <EmptyState
                                            icon={Heart}
                                            title="Your wishlist is empty"
                                            text="Explore the collection and tap the heart on anything you love."
                                            cta={
                                                <Link href="/shop" className={btnPrimary}>
                                                    Start shopping
                                                </Link>
                                            }
                                        />
                                    ) : (
                                        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                                            {wishlistItems.map((product, i) => {
                                                const thumbPath = pickShopCardPath(product);
                                                const imgSrc = thumbPath ? wishlistBuildImageUrl(thumbPath) : "/images/placeholder.png";
                                                return (
                                                    <motion.div
                                                        key={product._id}
                                                        initial={{ opacity: 0, y: 16 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: i * 0.05 }}
                                                        className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white bg-white/70 shadow-[0_24px_50px_-36px_rgba(122,44,78,0.5)] transition-shadow hover:shadow-[0_30px_60px_-30px_rgba(122,44,78,0.5)]"
                                                    >
                                                        <div className="relative aspect-[4/5] overflow-hidden bg-[#fbf1f5]">
                                                            <Image
                                                                src={imgSrc}
                                                                alt={product.name}
                                                                fill
                                                                className="object-cover transition-transform duration-700 group-hover:scale-105"
                                                            />
                                                            <button
                                                                onClick={() => {
                                                                    removeFromWishlist(product._id);
                                                                    setMessage({ type: "success", text: "Product removed from wishlist" });
                                                                    setTimeout(() => setMessage(null), 3000);
                                                                }}
                                                                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#8a7480] shadow-md backdrop-blur transition hover:text-rose-600"
                                                                title="Remove from wishlist"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>

                                                        <div className="flex flex-1 flex-col p-5">
                                                            <Link href={getProductHref(product)} className="block">
                                                                <h3
                                                                    className="line-clamp-1 text-xl text-[#7a2c4e] transition-colors group-hover:text-[#d14d86]"
                                                                    style={{ fontFamily: SERIF, fontWeight: 500 }}
                                                                >
                                                                    {product.name}
                                                                </h3>
                                                            </Link>
                                                            <div className="mb-5 mt-2 flex items-baseline gap-2">
                                                                <span className="text-lg font-medium">₹{product.price ?? "0"}</span>
                                                                <span className="text-xs text-[#c2adb6] line-through">
                                                                    ₹{(Number(product.price || 0) * 1.2).toFixed(0)}
                                                                </span>
                                                            </div>
                                                            <button
                                                                onClick={async () => {
                                                                    try {
                                                                        setSaveLoading(true);
                                                                        await cartAPI.add(product._id, 1);
                                                                        setMessage({ type: "success", text: "Added to cart!" });
                                                                        window.dispatchEvent(new Event("cartUpdated"));
                                                                        setTimeout(() => setMessage(null), 3000);
                                                                    } catch (err: any) {
                                                                        setMessage({ type: "error", text: err.message || "Failed to add to cart" });
                                                                    } finally {
                                                                        setSaveLoading(false);
                                                                    }
                                                                }}
                                                                disabled={saveLoading}
                                                                className={`${btnPrimary} mt-auto w-full py-3.5`}
                                                            >
                                                                {saveLoading ? <Spinner /> : <Package className="h-4 w-4" />}
                                                                Add to cart
                                                            </button>
                                                        </div>
                                                    </motion.div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </main>
                </div>
            </div>

            <OrderCancelModal
                isOpen={Boolean(cancelModalOrder)}
                order={cancelModalOrder}
                timeLeftLabel={
                    cancelModalOrder ? formatCancelTimeLeft(getOrderCancelEligibility(cancelModalOrder).cancelDeadline) : undefined
                }
                isLoading={Boolean(cancelModalOrder && cancellingOrderId === cancelModalOrder._id)}
                onClose={() => {
                    if (!cancellingOrderId) setCancelModalOrder(null);
                }}
                onConfirm={confirmCancelOrder}
            />
        </div>
    );
}