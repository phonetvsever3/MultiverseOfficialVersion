import { useState, useRef } from "react";
import { AdminSidebar } from "@/components/AdminSidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Image, Link, Type, Send, Loader2, X, CheckCircle2 } from "lucide-react";

export default function BroadcastPage() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImageUrl("");
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageUrl("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleSend = async () => {
    if (!text.trim()) {
      toast({ title: "Message text is required", variant: "destructive" });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("text", text.trim());
      if (imageFile) formData.append("image", imageFile);
      else if (imageUrl.trim()) formData.append("imageUrl", imageUrl.trim());
      if (buttonText.trim()) formData.append("buttonText", buttonText.trim());
      if (buttonUrl.trim()) formData.append("buttonUrl", buttonUrl.trim());

      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        toast({ title: data.message || "Broadcast failed", variant: "destructive" });
        return;
      }

      setResult({ sent: data.sent, failed: data.failed });
      toast({
        title: `Broadcast sent`,
        description: `Delivered to ${data.sent} user(s). ${data.failed > 0 ? `${data.failed} failed.` : ""}`,
      });
    } catch (e: any) {
      toast({ title: "Network error", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      <AdminSidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-600/30 flex items-center justify-center">
              <Megaphone className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Broadcast</h1>
              <p className="text-sm text-white/50">Send a message to all bot users</p>
            </div>
          </div>

          {/* Form Card */}
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 space-y-5">

            {/* Text */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <Type className="w-3.5 h-3.5" />
                Message Text <span className="text-red-400">*</span>
              </Label>
              <Textarea
                data-testid="broadcast-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Write your message here... Markdown supported (*bold*, _italic_, `code`)"
                rows={5}
                className="bg-gray-800 border-white/10 text-white placeholder:text-white/30 resize-none focus:border-red-500/50 focus:ring-0"
              />
              <p className="text-xs text-white/30">{text.length} characters · Markdown supported</p>
            </div>

            {/* Image Section */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <Image className="w-3.5 h-3.5" />
                Image (optional)
              </Label>

              {imagePreview ? (
                <div className="relative w-full rounded-xl overflow-hidden border border-white/10">
                  <img src={imagePreview} alt="preview" className="w-full max-h-64 object-cover" />
                  <button
                    onClick={clearImage}
                    data-testid="broadcast-clear-image"
                    className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 border border-white/20 flex items-center justify-center hover:bg-black text-white/80"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div
                    onClick={() => fileRef.current?.click()}
                    data-testid="broadcast-image-upload"
                    className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-red-500/40 hover:bg-white/5 transition-all"
                  >
                    <Image className="w-8 h-8 text-white/20" />
                    <span className="text-sm text-white/40">Click to upload an image</span>
                    <span className="text-xs text-white/25">JPG, PNG, GIF, WebP</span>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-xs text-white/30">or</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  <Input
                    data-testid="broadcast-image-url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://example.com/image.jpg"
                    className="bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:border-red-500/50"
                  />
                </div>
              )}
            </div>

            {/* Button / URL */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <Link className="w-3.5 h-3.5" />
                Button (optional)
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  data-testid="broadcast-button-text"
                  value={buttonText}
                  onChange={(e) => setButtonText(e.target.value)}
                  placeholder="Button label"
                  className="bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:border-red-500/50"
                />
                <Input
                  data-testid="broadcast-button-url"
                  value={buttonUrl}
                  onChange={(e) => setButtonUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-gray-800 border-white/10 text-white placeholder:text-white/30 focus:border-red-500/50"
                />
              </div>
              <p className="text-xs text-white/30">Both fields required to show button</p>
            </div>

            {/* Result */}
            {result && (
              <div className="flex items-center gap-3 rounded-xl bg-green-500/10 border border-green-500/20 px-4 py-3">
                <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                <span className="text-sm text-green-300">
                  Sent to <strong>{result.sent}</strong> user{result.sent !== 1 ? "s" : ""}.
                  {result.failed > 0 && <span className="text-yellow-400"> {result.failed} failed.</span>}
                </span>
              </div>
            )}

            {/* Send */}
            <Button
              data-testid="broadcast-send"
              onClick={handleSend}
              disabled={sending || !text.trim()}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold h-11 rounded-xl"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Broadcast
                </>
              )}
            </Button>
          </div>

          {/* Tips */}
          <div className="mt-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">Tips</p>
            <ul className="text-xs text-white/40 space-y-0.5 list-disc list-inside">
              <li>Use *bold* and _italic_ for Markdown formatting</li>
              <li>Image: upload a file or paste a direct image URL</li>
              <li>Button: requires both a label and a URL to appear</li>
              <li>A small delay is added between sends to avoid Telegram rate limits</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  );
}
