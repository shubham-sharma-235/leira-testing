"use client";

import { MiniNavbar } from "@/components/ui/mini-navbar";
import Footer from "@/components/Footer";
import { AboutHeroSection } from "@/components/ui/about-hero-section";
import { AboutBrandStorySection } from "@/components/ui/about-brand-story-section";
import { staticAssetUrl } from "@/lib/mediaUrl";

export default function AboutPage() {
  return (
    <>
      <MiniNavbar />
      <main className="min-h-screen bg-white leira-underlap-nav-spacer">
        <div className="relative z-10">
          <div className="bg-white">
            <div>
              <AboutHeroSection 
                imageSrc={staticAssetUrl("/images/about-hero-v2.jpg")}
                imageAlt="Leira - Feel good inside and out"
              />
              <AboutBrandStorySection />
            </div>
          </div>
        <Footer />
        </div>
      </main>
    </>
  );
}

