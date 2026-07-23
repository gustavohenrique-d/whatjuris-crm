import { SessionProvider } from 'next-auth/react';
import NextNProgress from 'nextjs-progressbar';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Authenticationlayout from '../shared/layout-components/layout/authentication-layout';
import Contentlayout from '../shared/layout-components/layout/contentlayout';
import '../styles/globals.scss';
// Design WhatJuris (módulo 10) — importado por último para sobrepor o tema do template
import '../styles/whatjuris-tokens.css';
import '../styles/whatjuris-base.css';

const layouts = {
    Contentlayout: Contentlayout,
    Authenticationlayout: Authenticationlayout,
};
function MyApp({ Component, pageProps: { session, ...pageProps } }) {
    const Layout =
        layouts[Component.layout] ||
        ((pageProps) => <Component>{pageProps}</Component>);
    return (
        <SessionProvider session={session}>
            <Layout>
                <Component {...pageProps} />
            </Layout>
            <NextNProgress color="#fff" />
            <ToastContainer theme="colored" />
        </SessionProvider>
    );
}

export default MyApp;
