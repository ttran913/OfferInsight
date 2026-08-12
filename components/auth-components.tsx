"use client"

import { handleSignIn, handleSignOut } from "./auth-actions"
import { Button } from "./ui/button"

export function SignIn({
  provider,
  ...props
}: { provider?: string } & React.ComponentPropsWithRef<typeof Button>) {
  return (
    <form
      action={handleSignIn.bind(null, provider)}
    >
      <Button 
        className="bg-accent-teal hover:opacity-90 text-white px-3 sm:px-6 py-2 text-sm sm:text-base rounded-lg font-semibold transition-colors whitespace-nowrap"
        {...props}
      >
        Sign In
      </Button>
    </form>
  )
}

export function SignOut(props: React.ComponentPropsWithRef<typeof Button>) {
  return (
    <form
      action={handleSignOut}
    >
      <Button 
        variant="ghost" 
        className="text-gray-600 hover:text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors"
        {...props}
      >
        Sign Out
      </Button>
    </form>
  );
}
