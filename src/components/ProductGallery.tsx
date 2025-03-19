import React, { useState } from "react";

// Définissez l'interface Product pour correspondre à la structure de vos données JSON
interface Product {
  url: string;
  tab_description: string | null | undefined;
  images: {
    src: string | null;
    data_twic_src: string | null;
    alt: string | null;
  }[];
}

interface ProductGalleryProps {
  products: Product[];
}

const ProductGallery: React.FC<ProductGalleryProps> = ({ products }) => {
  const [filter, setFilter] = useState("all");

  // Catégories pour le filtrage
  const categories = [
    { id: "all", name: "Tous les produits" },
    { id: "hallux", name: "Hallux Valgus" },
    { id: "douleurs", name: "Douleurs plantaires" },
    { id: "cors", name: "Cors et durillons" },
    { id: "sport", name: "Sport" },
    { id: "cheville", name: "Cheville" },
  ];

  // Filtrer les produits selon la catégorie
  const filteredProducts = products.filter((product) => {
    if (filter === "all") return true;
    if (filter === "hallux") return product.url.includes("hallux");
    if (filter === "douleurs")
      return (
        product.url.includes("plantaire") || product.url.includes("metatars")
      );
    if (filter === "cors")
      return product.url.includes("cor") || product.url.includes("durillon");
    if (filter === "sport") return product.url.includes("sport");
    if (filter === "cheville") return product.url.includes("cheville");
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Filtres */}
      <div className="flex flex-wrap gap-2 mb-8">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
              filter === category.id
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-800 hover:bg-gray-200"
            }`}
            onClick={() => setFilter(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      {/* Grille de produits */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts
          .filter(
            (product) =>
              product.images &&
              product.images.length > 0 &&
              product.images[0]?.src
          )
          .map((product, index) => (
            <div
              key={index}
              className="bg-white rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-transform duration-300 hover:-translate-y-1"
            >
              {/* Image du produit */}
              <div className="h-48 overflow-hidden">
                <img
                  src={product.images[0].src || ""}
                  alt={product.images[0].alt || "Produit Epitact"}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Informations du produit */}
              <div className="p-4">
                <h3 className="text-lg font-semibold text-gray-800 mb-2">
                  {getProductName(product.url)}
                </h3>

                {product.tab_description && (
                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {product.tab_description}
                  </p>
                )}

                <a
                  href={product.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors duration-200"
                >
                  Voir le produit
                </a>
              </div>
            </div>
          ))}
      </div>

      {/* Message si aucun produit */}
      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500">
            Aucun produit ne correspond à ce filtre.
          </p>
        </div>
      )}
    </div>
  );
};

// Fonction pour extraire un nom de produit à partir de l'URL
const getProductName = (url: string) => {
  const parts = url.split("/");
  const lastPart = parts[parts.length - 1];
  return lastPart
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

export default ProductGallery;
