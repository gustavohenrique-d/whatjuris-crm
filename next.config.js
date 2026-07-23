/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === "production";
const nextConfig = {
	// output: "export", // Comment this line when not building the project
	// false: o duplo-invoke de efeitos do StrictMode em dev, com SSR de conteúdo
	// dinâmico, causava mismatch de hidratação que congelava o DOM. Produção não
	// usa o duplo-invoke; este valor não afeta o build de produção.
	reactStrictMode: false,
	trailingSlash: true,
	swcMinify: true,
	basePath: "",
	assetPrefix: "",
	images: {
		loader: "imgix",
		path: "/",
	},
};

module.exports = nextConfig;

