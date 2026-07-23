export const MENUITEMS = [
    {
        menutitle: 'GERAL',
    },
    {
        title: 'Dashboard',
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="side-menu__icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
            >
                <path d="M3 13h1v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7h1a1 1 0 0 0 .707-1.707l-9-9a.999.999 0 0 0-1.414 0l-9 9A1 1 0 0 0 3 13zm7 7v-5h4v5h-4zm2-15.586 6 6V15l.001 5H16v-5c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H6v-9.586l6-6z" />
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/dashboard',
    },

    {
        menutitle: 'RELATÓRIOS',
    },
    {
        title: 'Financeiro',
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="side-menu__icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
            >
                <path d="M20 7h-4V4c0-1.103-.897-2-2-2h-4c-1.103 0-2 .897-2 2v5H4c-1.103 0-2 .897-2 2v9a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1V9c0-1.103-.897-2-2-2zM4 11h4v8H4v-8zm6-1V4h4v15h-4v-9zm10 9h-4V9h4v10z" />
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/finance/',
    },
    {
        menutitle: 'GERENCIAMENTO',
    },
    {
        title: 'Produtos',
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="side-menu__icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
            >
                <path d="M20 7h-1.209A4.92 4.92 0 0 0 19 5.5C19 3.57 17.43 2 15.5 2c-1.622 0-2.705 1.482-3.404 3.085C11.407 3.57 10.269 2 8.5 2 6.57 2 5 3.57 5 5.5c0 .596.079 1.089.209 1.5H4c-1.103 0-2 .897-2 2v2c0 1.103.897 2 2 2v7c0 1.103.897 2 2 2h12c1.103 0 2-.897 2-2v-7c1.103 0 2-.897 2-2V9c0-1.103-.897-2-2-2zm-4.5-3c.827 0 1.5.673 1.5 1.5C17 7 16.374 7 16 7h-2.478c.511-1.576 1.253-3 1.978-3zM7 5.5C7 4.673 7.673 4 8.5 4c.888 0 1.714 1.525 2.198 3H8c-.374 0-1 0-1-1.5zM4 9h7v2H4V9zm2 11v-7h5v7H6zm12 0h-5v-7h5v7zm-5-9V9.085L13.017 9H20l.001 2H13z" />
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/products/',
    },
    {
        title: 'Cupom',
        icon: (
            <svg
                className="side-menu__icon"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
            >
                <path d="M21.7071 3.70711C22.0976 3.31658 22.0976 2.68342 21.7071 2.29289C21.3166 1.90237 20.6834 1.90237 20.2929 2.29289L2.29289 20.2929C1.90237 20.6834 1.90237 21.3166 2.29289 21.7071C2.68342 22.0976 3.31658 22.0976 3.70711 21.7071L21.7071 3.70711Z" />
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M11 6.5C11 8.98528 8.98528 11 6.5 11C4.01472 11 2 8.98528 2 6.5C2 4.01472 4.01472 2 6.5 2C8.98528 2 11 4.01472 11 6.5ZM4.00693 6.5C4.00693 7.87689 5.12311 8.99307 6.5 8.99307C7.87689 8.99307 8.99307 7.87689 8.99307 6.5C8.99307 5.12311 7.87689 4.00693 6.5 4.00693C5.12311 4.00693 4.00693 5.12311 4.00693 6.5Z"
                />
                <path
                    fill-rule="evenodd"
                    clip-rule="evenodd"
                    d="M22 17.5C22 19.9853 19.9853 22 17.5 22C15.0147 22 13 19.9853 13 17.5C13 15.0147 15.0147 13 17.5 13C19.9853 13 22 15.0147 22 17.5ZM15.0069 17.5C15.0069 18.8769 16.1231 19.9931 17.5 19.9931C18.8769 19.9931 19.9931 18.8769 19.9931 17.5C19.9931 16.1231 18.8769 15.0069 17.5 15.0069C16.1231 15.0069 15.0069 16.1231 15.0069 17.5Z"
                />
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/coupon/',
    },
    {
        title: 'Categorias',
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="side-menu__icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
            >
                <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"></path>
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/categories/',
    },

    {
        menutitle: 'USUÁRIOS',
    },
    {
        title: 'Usuários',
        icon: (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                className="side-menu__icon person"
                width="24"
                height="24"
                viewBox="0 0 24 24"
            >
                <path d="M5 21C5 17.134 8.13401 14 12 14C15.866 14 19 17.134 19 21M16 7C16 9.20914 14.2091 11 12 11C9.79086 11 8 9.20914 8 7C8 4.79086 9.79086 3 12 3C14.2091 3 16 4.79086 16 7Z" />{' '}
            </svg>
        ),
        type: 'link',
        selected: false,
        path: '/admin/users',
    },
];
