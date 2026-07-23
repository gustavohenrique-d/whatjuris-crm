import Head from 'next/head';
import favicon from '../../../public/assets/images/brand-logos/favicon.ico';
const Seo = ({ title }) => {
    let i = title ? `WhatJuris — ${title}` : 'WhatJuris';
    return (
        <Head>
            <title>{i}</title>
            <link href={favicon.src} rel="icon"></link>
            <meta
                name="description"
                content="WhatJuris — CRM jurídico com triagem de leads por IA no WhatsApp"
            />
            <meta
                name="author"
                content="Solid Tecnologia Technologies Private Limited"
            />
            <meta
                name="keywords"
                content="react bootstrap dashboard
admin dashboard template
react nextjs admin template
react next js admin dashboard
admin dashboard nextjs
next js admin dashboard
admin panel template react bootstrap
react bootstrap dashboard template
nextjs dashboard
next js dashboard template
react bootstrap admin template
react next js admin panel dashboard template
react admin dashboard template
dashboard template react bootstrap
admin and dashboard template"
            ></meta>
        </Head>
    );
};

export default Seo;
