import { useState, useEffect } from 'react';
import { api } from '@/lib/api-client';
import { 
  Download, 
  Globe, 
  ExternalLink,
  Info,
  Copy,
  CheckCircle2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';

export function QrCodesPage() {
  const [tenantSlug, setTenantSlug] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [storefrontBaseUrl, setStorefrontBaseUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadTenantInfo = async () => {
      const res = await api.get<any>('/tenant/me');
      if (res.success) {
        setTenantSlug(res.data.slug);
        setTenantName(res.data.name);
      }
    };
    loadTenantInfo();

    const envBase = (import.meta.env.VITE_STOREFRONT_BASE_URL as string | undefined)?.trim();
    if (envBase) {
      setStorefrontBaseUrl(envBase.replace(/\/+$/, ''));
    } else {
      setStorefrontBaseUrl(window.location.origin.replace('tenant', 'storefront').replace('8081', '3000'));
    }
  }, []);

  const publicUrl = `${storefrontBaseUrl}/${tenantSlug}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadQRCode = () => {
    const svg = document.getElementById('main-qr');
    if (!svg) return;
    
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    img.onload = () => {
      canvas.width = 1200;
      canvas.height = 1200;
      if (ctx) {
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // QR Code
        ctx.drawImage(img, 100, 100, 1000, 1000);
        
        // Label
        ctx.fillStyle = 'black';
        ctx.font = 'black 60px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tenantName.toUpperCase(), 600, 1140);
        
        const pngFile = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.download = `QR_CODE_DELIVERY_${tenantSlug}.png`;
        downloadLink.href = pngFile;
        downloadLink.click();
      }
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 text-left">
      <header>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">Marketing e Acesso</h1>
        <p className="text-gray-500 dark:text-gray-400 font-medium uppercase text-[10px] tracking-widest mt-1">Gerencie o acesso público à sua loja e gere materiais de divulgação</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Link Section */}
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2.5rem] p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-6">
               <div className="w-12 h-12 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center">
                  <Globe size={24} />
               </div>
               <div>
                  <h3 className="font-black text-gray-900 dark:text-white">Link do Cardápio</h3>
                  <p className="text-xs text-gray-500 font-bold uppercase tracking-tighter">Seu endereço web exclusivo</p>
               </div>
            </div>

            <div className="flex items-center gap-2 p-4 bg-gray-50 dark:bg-gray-950 rounded-2xl border border-gray-100 dark:border-gray-800 mb-6">
               <span className="text-sm font-bold text-gray-600 dark:text-gray-400 truncate flex-1">{publicUrl}</span>
               <button 
                 onClick={handleCopy}
                 className={`p-2 rounded-xl transition-all ${copied ? 'text-emerald-500 bg-emerald-500/10' : 'text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
               >
                  {copied ? <CheckCircle2 size={20} /> : <Copy size={20} />}
               </button>
            </div>

            <a 
              href={publicUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="w-full bg-gray-900 dark:bg-gray-800 hover:bg-black text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl shadow-gray-900/20"
            >
               Testar Cardápio Online
               <ExternalLink size={14} />
            </a>
          </div>

          <div className="bg-amber-500/5 border border-amber-500/10 rounded-[2rem] p-6 flex gap-4">
             <div className="w-10 h-10 bg-amber-500/10 text-amber-500 rounded-xl flex items-center justify-center shrink-0">
                <Info size={20} />
             </div>
             <div>
                <p className="text-sm text-amber-700 dark:text-amber-400 font-bold mb-1">Dica de Sucesso</p>
                <p className="text-xs text-amber-600/80 dark:text-amber-500/60 leading-relaxed font-medium">Coloque este link na biografia do seu Instagram e WhatsApp Business para facilitar a compra direta sem taxas de marketplaces.</p>
             </div>
          </div>
        </div>

        {/* QR Code Section */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-[2.5rem] p-8 shadow-sm flex flex-col items-center">
          <div className="text-center mb-8">
             <h3 className="font-black text-gray-900 dark:text-white mb-1">QR Code de Delivery</h3>
             <p className="text-xs text-gray-500 font-bold uppercase tracking-tighter">Ideal para adesivos e mesas</p>
          </div>

          <div className="bg-white p-8 rounded-[3rem] shadow-2xl border border-gray-50 mb-8">
             <QRCodeSVG 
               id="main-qr"
               value={publicUrl} 
               size={240} 
               level="H" 
               includeMargin={true}
             />
          </div>

          <button 
            onClick={downloadQRCode}
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-xl shadow-emerald-900/20 active:scale-95"
          >
             <Download size={20} />
             Baixar QR Code Alta Resolução
          </button>

          <p className="mt-6 text-[10px] text-gray-400 font-black uppercase tracking-widest">Formato PNG • 1200x1200px</p>
        </div>
      </div>
    </div>
  );
}
