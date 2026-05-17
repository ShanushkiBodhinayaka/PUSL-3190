import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ROLES = new Set([
    'admin',
    'inventory_manager',
    'sales_operator',
    'approval_manager',
    'staff',
]);

Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL');
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

        if (!supabaseUrl || !serviceRoleKey || !anonKey) {
            return new Response(
                JSON.stringify({ error: 'Missing required Supabase environment variables.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization header.' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const userClient = createClient(supabaseUrl, anonKey, {
            global: { headers: { Authorization: authHeader } },
        });
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const {
            data: { user },
            error: authError,
        } = await userClient.auth.getUser();

        if (authError || !user) {
            return new Response(JSON.stringify({ error: 'Unauthorized.' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { data: profile, error: profileError } = await adminClient
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        if (profileError || profile?.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Only admins can invite users.' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const body = await request.json();
        const email = String(body.email || '').trim().toLowerCase();
        const fullName = body.fullName ? String(body.fullName).trim() : null;
        const role = String(body.role || '').trim();

        if (!email) {
            return new Response(JSON.stringify({ error: 'Email is required.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        if (!ROLES.has(role)) {
            return new Response(JSON.stringify({ error: 'Invalid role.' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const { error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
            data: {
                full_name: fullName,
                role,
            },
        });

        if (inviteError) {
            return new Response(JSON.stringify({ error: inviteError.message }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message || 'Unexpected error.' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});
