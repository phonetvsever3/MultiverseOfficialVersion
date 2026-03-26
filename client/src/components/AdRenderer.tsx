import { useEffect, useRef } from "react";
import { type Ad } from "@shared/schema";

interface AdRendererProps {
  ad: Ad;
}

export function AdRenderer({ ad }: AdRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !ad.content) return;

    const content = ad.content.trim();

    if (ad.type === 'custom_redirect') {
      return;
    }

    // Clear previous content
    containerRef.current.innerHTML = '';

    // Check if content is a URL
    if (content.startsWith('http://') || content.startsWith('https://')) {
      const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(content);
      const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(content);

      if (isImage) {
        const img = document.createElement('img');
        img.src = content;
        img.alt = ad.title || 'Advertisement';
        img.className = 'w-full h-full object-cover rounded-xl';
        img.loading = 'lazy';
        containerRef.current.appendChild(img);
        return;
      }

      if (isVideo) {
        const video = document.createElement('video');
        video.src = content;
        video.autoplay = true;
        video.muted = true;
        video.controls = true;
        video.loop = true;
        video.className = 'w-full h-full object-cover rounded-xl bg-black';
        containerRef.current.appendChild(video);
        return;
      }
    }

    // Check if content is HTML/script
    if (content.startsWith('<')) {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');
        
        // Get all script tags
        const scripts = doc.querySelectorAll('script');
        
        // Append non-script content first
        Array.from(doc.body.childNodes).forEach(node => {
          if (node.nodeName !== 'SCRIPT') {
            const cloned = node.cloneNode(true);
            containerRef.current?.appendChild(cloned);
          }
        });

        // Execute scripts in order
        scripts.forEach(script => {
          const newScript = document.createElement('script');
          
          if (script.src) {
            newScript.src = script.src;
            newScript.async = script.async;
            newScript.defer = script.defer;
            if (script.attributes) {
              Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
              });
            }
          } else {
            newScript.textContent = script.textContent;
          }
          
          containerRef.current?.appendChild(newScript);
        });

        // Trigger resize for responsive ads
        window.dispatchEvent(new Event('resize'));
      } catch (e) {
        console.error('Failed to parse ad content:', e);
      }
      return;
    }

    // Plain text fallback - treat as URL
    const a = document.createElement('a');
    a.href = content;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = ad.title || 'View Offer';
    a.className = 'block w-full py-3 px-4 bg-primary text-white font-bold rounded-xl text-center text-xs hover:bg-primary/90 transition-all';
    containerRef.current.appendChild(a);

  }, [ad.id, ad.content, ad.type]);

  if (ad.type === 'custom_redirect') {
    return (
      <a 
        href={ad.content || "#"} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block w-full py-3 px-4 bg-primary text-white font-bold rounded-xl text-center text-xs hover:bg-primary/90 transition-all shadow-lg"
      >
        {ad.title || 'Visit Sponsor'} ➔
      </a>
    );
  }

  return (
    <div 
      ref={containerRef}
      className="w-full h-full flex items-center justify-center p-2 overflow-hidden rounded-xl bg-black/30"
    />
  );
}
