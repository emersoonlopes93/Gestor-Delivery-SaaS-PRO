import { useEffect, useMemo, useState } from 'react';
import { Folder, Image, RefreshCw, Search, Trash2, UploadCloud, Edit2, Sparkles } from 'lucide-react';
import { api } from '../../lib/api-client';

type MediaAsset = {
  id: string;
  title: string | null;
  originalName: string | null;
  publicUrl: string;
  altText: string | null;
  publicationStatus: string;
  status: string;
  createdAt: string;
  category?: string | null;
  categoryId?: string | null;
  tagsJson?: string[] | null;
};

type MediaCategory = {
  id: string;
  name: string;
  slug: string;
};

export function GlobalMediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [categories, setCategories] = useState<MediaCategory[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadTags, setUploadTags] = useState('');
  const [uploadCategory, setUploadCategory] = useState<string>('');
  const [publicationStatus, setPublicationStatus] = useState<'published' | 'draft'>('draft');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Estados de Gerenciamento de Categorias
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryDesc, setNewCategoryDesc] = useState('');
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  // Edit Modal
  const [editingAsset, setEditingAsset] = useState<MediaAsset | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editStatus, setEditStatus] = useState<'published' | 'draft'>('published');
  const [editTags, setEditTags] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // AI Generation
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiProduct, setAiProduct] = useState('');
  const [aiSegment, setAiSegment] = useState('');
  const [aiCategory, setAiCategory] = useState('');
  const [aiPrompt, setAiPrompt] = useState('Imagem comercial genérica e apetitosa de {produto}, fotografia de comida profissional, fundo limpo, iluminação natural, sem texto, sem logotipo, sem marca, alta qualidade.');
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  async function loadCategories() {
    try {
      const response = await api.get<MediaCategory[]>('/admin/media/categories');
      setCategories(response.data);
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  }

  async function handleCreateCategory() {
    if (!newCategoryName.trim()) return;
    setIsSavingCategory(true);
    try {
      await api.post('/admin/media/categories', {
        name: newCategoryName.trim(),
        description: newCategoryDesc.trim() || undefined,
      });
      setNewCategoryName('');
      setNewCategoryDesc('');
      await loadCategories();
    } catch (error) {
      console.error('Failed to create category:', error);
      alert('Erro ao criar categoria.');
    } finally {
      setIsSavingCategory(false);
    }
  }

  async function handleDeleteCategory(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir esta categoria? As imagens vinculadas a ela não serão excluídas, mas ficarão sem categoria.')) return;
    try {
      await api.delete(`/admin/media/categories/${id}`);
      await loadCategories();
    } catch (error) {
      console.error('Failed to delete category:', error);
      alert('Erro ao excluir categoria.');
    }
  }

  const filteredAssets = useMemo(() => {
    let filtered = [...assets];

    // Search filter
    const term = search.trim().toLowerCase();
    if (term) {
      filtered = filtered.filter((asset) => {
        const inTitle = [asset.title, asset.originalName, asset.altText]
          .filter((value): value is string => typeof value === 'string')
          .some((value) => value.toLowerCase().includes(term));
        const inTags = asset.tagsJson?.some((tag) => tag.toLowerCase().includes(term));
        return inTitle || inTags;
      });
    }

    // Category filter
    if (selectedCategory) {
      filtered = filtered.filter((asset) => asset.categoryId === selectedCategory);
    }

    // Status filter
    if (selectedStatus) {
      filtered = filtered.filter((asset) => asset.publicationStatus === selectedStatus);
    }

    return filtered;
  }, [assets, search, selectedCategory, selectedStatus]);

  async function loadAssets() {
    setIsLoading(true);
    try {
      const response = await api.get<MediaAsset[]>('/admin/media/gallery');
      setAssets(response.data);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const formData = new FormData();
        formData.set('file', file);
        formData.set('title', file.name);
        if (uploadCategory) {
          formData.set('categoryId', uploadCategory);
        }
        formData.set('publicationStatus', publicationStatus);
        formData.set('altText', file.name);
        if (uploadTags.trim()) {
          formData.set('tags', uploadTags.trim());
        }
        
        try {
          await api.upload<MediaAsset>('/admin/media/gallery/upload', formData);
        } catch (err) {
          console.error(`Error uploading ${file.name}:`, err);
        }
        setUploadProgress(i + 1);
      }
      setFiles([]);
      setUploadTags('');
      setUploadCategory('');
      setUploadProgress(0);
      await loadAssets();
    } finally {
      setIsUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente esta imagem global?')) return;
    await api.delete<MediaAsset>(`/admin/media/gallery/${id}`);
    await loadAssets();
  }

  function handleEditClick(asset: MediaAsset) {
    setEditingAsset(asset);
    setEditTitle(asset.title ?? asset.originalName ?? '');
    setEditCategory(asset.categoryId ?? '');
    setEditStatus((asset.publicationStatus as 'published' | 'draft') ?? 'published');
    setEditTags(asset.tagsJson ? asset.tagsJson.join(', ') : '');
  }

  async function handleSaveEdit() {
    if (!editingAsset) return;
    setIsSavingEdit(true);
    try {
      await api.patch(`/admin/media/gallery/${editingAsset.id}`, {
        title: editTitle,
        altText: editTitle,
        categoryId: editCategory || undefined,
        publicationStatus: editStatus,
        tags: editTags.trim(),
      });
      setEditingAsset(null);
      await loadAssets();
    } catch (err) {
      console.error('Failed to edit asset', err);
      alert('Falha ao editar a imagem.');
    } finally {
      setIsSavingEdit(false);
    }
  }

  async function handleGenerateAi() {
    if (!aiProduct || !aiPrompt) return;
    setIsGeneratingAi(true);
    try {
      const finalPrompt = aiPrompt.replace('{produto}', aiProduct);
      let tags = `lookup:${aiProduct.replace(/[^a-z0-9]/gi, '_').toLowerCase()}, tag:${aiProduct.split(' ')[0].toLowerCase()}`;
      if (aiSegment) tags += `, segment:${aiSegment.toLowerCase()}`;
      
      await api.post('/admin/media/ai-generate', {
        title: aiProduct,
        prompt: finalPrompt,
        categoryId: aiCategory || undefined,
        tags: tags,
      });
      setShowAiModal(false);
      setAiProduct('');
      await loadAssets();
    } catch (err) {
      console.error('Failed to generate image', err);
      const e = err as { response?: { data?: { message?: string } } };
      const errorMessage = e?.response?.data?.message || 'Falha ao gerar a imagem com IA.';
      alert(errorMessage);
    } finally {
      setIsGeneratingAi(false);
    }
  }

  useEffect(() => {
    void loadAssets();
    void loadCategories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Biblioteca Global</h1>
          <p className="text-sm font-bold text-muted-foreground mt-1">Imagens comerciais publicadas aqui ficam disponíveis para todos os tenants em seus Cardápios Bases.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAiModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-sm font-black text-primary hover:bg-primary/20 transition-colors"
          >
            <Sparkles className="h-4 w-4" />
            Gerar com IA
          </button>
          <button
            type="button"
            onClick={() => setShowCategoriesModal(true)}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-black text-foreground hover:bg-muted transition-colors"
          >
            <Folder className="h-4 w-4 text-primary" />
            Categorias
          </button>
          <button
            type="button"
            onClick={loadAssets}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-card border border-border px-4 py-2 text-sm font-black text-foreground hover:bg-muted"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <section className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-black text-foreground uppercase tracking-wider">
            <UploadCloud className="h-4 w-4 text-primary" />
            Upload em Lote
          </div>
          <p className="text-[10px] uppercase font-bold text-muted-foreground leading-relaxed">
            Selecione múltiplos arquivos e defina uma categoria e status base para todos.
          </p>
          <input
            type="file"
            multiple
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
            className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-xl file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-black file:text-primary-foreground"
          />
          <div className="space-y-1">
            <input
              value={uploadTags}
              onChange={(event) => setUploadTags(event.target.value)}
              className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="Tags (ex: lookup:pizza, tag:massa)"
            />
            <p className="text-[10px] font-bold text-muted-foreground px-1">
              Use "lookup:[key]" para parear perfeitamente com o Seed do Catálogo.
            </p>
          </div>
          <select
            value={uploadCategory}
            onChange={(event) => setUploadCategory(event.target.value)}
            className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Sem Categoria Específica</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <div className="grid grid-cols-2 gap-2">
            {(['published', 'draft'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setPublicationStatus(status)}
                className={`rounded-xl px-3 py-2 text-xs font-black uppercase ${
                  publicationStatus === status ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {status === 'published' ? 'Publicar' : 'Rascunho'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleUpload}
            disabled={files.length === 0 || isUploading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-black text-primary-foreground disabled:opacity-60 transition-colors"
          >
            <UploadCloud className="h-4 w-4" />
            {isUploading ? `Enviando (${uploadProgress}/${files.length})...` : `Enviar ${files.length} arquivos`}
          </button>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-3">
            <div className="flex-1">
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full h-10 pl-10 pr-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nome, descrição, tag, lookup..."
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Categoria</label>
              <select
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
                className="h-10 px-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring min-w-[200px]"
              >
                <option value="">Todas</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-black uppercase text-muted-foreground mb-1.5 block">Status</label>
              <select
                value={selectedStatus}
                onChange={(event) => setSelectedStatus(event.target.value)}
                className="h-10 px-3 bg-card border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring min-w-[150px]"
              >
                <option value="">Todos</option>
                <option value="published">Publicado</option>
                <option value="draft">Rascunho (Pendente)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 2xl:grid-cols-5 gap-4">
            {filteredAssets.map((asset) => {
              const categoryName = categories.find((c) => c.id === asset.categoryId)?.name;
              const isDraft = asset.publicationStatus === 'draft';
              
              return (
                <article key={asset.id} className={`bg-card border ${isDraft ? 'border-amber-500/50' : 'border-border'} rounded-2xl overflow-hidden relative group`}>
                  {isDraft && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-amber-950 text-[10px] font-black uppercase px-2 py-1 rounded-lg z-10">
                      Rascunho
                    </div>
                  )}
                  <div className="aspect-square bg-muted relative">
                    <img src={asset.publicUrl} alt={asset.altText ?? asset.title ?? 'Media'} className={`h-full w-full object-cover transition-opacity ${isDraft ? 'opacity-80' : 'opacity-100'}`} />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEditClick(asset)}
                        className="h-10 w-10 bg-white/10 backdrop-blur rounded-full flex items-center justify-center text-white hover:bg-primary transition-colors"
                        title="Editar Imagem"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 space-y-2">
                    <div>
                      <p className="text-sm font-black text-foreground truncate" title={asset.title ?? asset.originalName ?? 'Imagem'}>{asset.title ?? asset.originalName ?? 'Imagem'}</p>
                      {categoryName && (
                        <p className="text-[10px] font-bold text-muted-foreground truncate">Categoria: {categoryName}</p>
                      )}
                      
                      {asset.tagsJson && asset.tagsJson.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {asset.tagsJson.slice(0, 3).map(t => (
                            <span key={t} className="bg-primary/10 text-primary text-[9px] font-bold px-1.5 py-0.5 rounded-md truncate max-w-[80px]" title={t}>{t}</span>
                          ))}
                          {asset.tagsJson.length > 3 && (
                            <span className="bg-muted text-muted-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-md">+{asset.tagsJson.length - 3}</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t border-border flex justify-end">
                      <button
                        type="button"
                        onClick={() => handleDelete(asset.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remover Permamentemente"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
            {!isLoading && filteredAssets.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground flex flex-col items-center">
                <Image className="h-10 w-10 mb-3 opacity-50" />
                <p className="text-sm font-bold">Nenhuma imagem encontrada.</p>
                <p className="text-xs mt-1">Envie novas imagens usando o painel à esquerda.</p>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* Modal Categoria */}
      {showCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                <Folder className="h-5 w-5 text-primary" />
                Gerenciar Categorias
              </h2>
              <button
                type="button"
                onClick={() => setShowCategoriesModal(false)}
                className="text-muted-foreground hover:text-foreground font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">
              <div className="space-y-3 bg-muted/30 p-4 rounded-xl border border-border/50">
                <p className="text-xs font-black uppercase text-muted-foreground">Nova Categoria</p>
                <input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="Nome da categoria *"
                />
                <input
                  value={newCategoryDesc}
                  onChange={(e) => setNewCategoryDesc(e.target.value)}
                  className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="Descrição (opcional)"
                />
                <button
                  type="button"
                  onClick={handleCreateCategory}
                  disabled={!newCategoryName.trim() || isSavingCategory}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary h-10 text-sm font-black text-primary-foreground disabled:opacity-60"
                >
                  Adicionar
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-black uppercase text-muted-foreground">Categorias Existentes</p>
                {categories.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>
                ) : (
                  <div className="divide-y divide-border/50 border border-border rounded-xl overflow-hidden bg-background max-h-[30vh] overflow-y-auto">
                    {categories.map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between p-3 hover:bg-muted/10 transition-colors">
                        <div>
                          <p className="text-sm font-bold text-foreground">{cat.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{cat.slug}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="text-destructive hover:bg-destructive/10 p-2 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => setShowCategoriesModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-sm font-black text-foreground hover:bg-muted"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edição de Imagem */}
      {editingAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-4xl w-full p-6 shadow-2xl flex flex-col md:flex-row gap-6 max-h-[90vh] animate-in zoom-in-95 duration-200">
            
            <div className="w-full md:w-1/2 flex items-center justify-center bg-muted rounded-xl overflow-hidden border border-border/50">
              <img src={editingAsset.publicUrl} alt="Preview" className="max-w-full max-h-[50vh] object-contain" />
            </div>

            <div className="w-full md:w-1/2 flex flex-col">
              <div className="flex items-center justify-between pb-4 border-b border-border">
                <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                  <Edit2 className="h-5 w-5 text-primary" />
                  Editar Imagem
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingAsset(null)}
                  className="text-muted-foreground hover:text-foreground font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Título (Alt Text)</label>
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Nome amigável da imagem"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Tags de Busca e Pareamento</label>
                  <input
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="lookup:pizza_calabresa, tag:massa"
                  />
                  <p className="text-[10px] text-muted-foreground font-bold leading-relaxed">
                    Exemplo de uso:<br/>
                    Para importar automaticamente a "Pizza de Calabresa", adicione a tag <span className="bg-primary/10 text-primary px-1 rounded">lookup:pizza_calabresa</span> ou <span className="bg-primary/10 text-primary px-1 rounded">tag:pizza</span>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Categoria Visual</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Nenhuma / Solta</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Visibilidade (Status)</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['published', 'draft'] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() => setEditStatus(status)}
                        className={`rounded-xl px-4 py-3 text-sm font-black uppercase transition-colors ${
                          editStatus === status 
                            ? 'bg-primary text-primary-foreground border-2 border-primary' 
                            : 'bg-card text-muted-foreground border-2 border-input hover:bg-muted'
                        }`}
                      >
                        {status === 'published' ? '✅ Publicado' : '📝 Rascunho'}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-bold pt-1">
                    Tenants e Lojistas só verão imagens marcadas como <b>Publicado</b> em seus catálogos base.
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setEditingAsset(null)}
                  className="rounded-xl border border-input px-5 py-2 text-sm font-black text-foreground hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="rounded-xl bg-primary px-5 py-2 text-sm font-black text-primary-foreground flex items-center gap-2 hover:brightness-110 disabled:opacity-60"
                >
                  {isSavingEdit && <RefreshCw className="h-4 w-4 animate-spin" />}
                  Salvar Imagem
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Gerador de IA */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-card border border-border rounded-2xl max-w-lg w-full p-6 shadow-2xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-border">
              <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Gerar Imagem com IA
              </h2>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="text-muted-foreground hover:text-foreground font-bold"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-6 space-y-4 pr-1">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl mb-2">
                <p className="text-xs text-amber-600 font-bold">
                  ⚠️ Imagens geradas entram como <b>Rascunho</b> e precisam ser publicadas manualmente para aparecerem aos tenants. O processo leva cerca de 15 segundos.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-muted-foreground">Produto (Ex: Pizza Calabresa)</label>
                <input
                  value={aiProduct}
                  onChange={(e) => setAiProduct(e.target.value)}
                  className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring text-foreground"
                  placeholder="Nome do produto principal *"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Segmento (Opcional)</label>
                  <input
                    value={aiSegment}
                    onChange={(e) => setAiSegment(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring text-foreground"
                    placeholder="Ex: Pizzaria"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-muted-foreground">Categoria Visual</label>
                  <select
                    value={aiCategory}
                    onChange={(e) => setAiCategory(e.target.value)}
                    className="w-full h-10 px-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Nenhuma</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-muted-foreground">Prompt Automático (Editável)</label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="w-full h-24 p-3 bg-background border border-input rounded-xl text-sm outline-none focus:ring-2 focus:ring-ring text-foreground resize-none"
                  placeholder="Instruções para a inteligência artificial..."
                />
              </div>
            </div>

            <div className="pt-4 border-t border-border flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="rounded-xl border border-input px-5 py-2 text-sm font-black text-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGenerateAi}
                disabled={!aiProduct || !aiPrompt || isGeneratingAi}
                className="rounded-xl bg-primary px-5 py-2 text-sm font-black text-primary-foreground flex items-center gap-2 hover:brightness-110 disabled:opacity-60"
              >
                {isGeneratingAi ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Gerando (~15s)...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar e Salvar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
