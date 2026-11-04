require 'redmine'
require 'active_support/concern'
require_dependency 'derkumpel_push/notifications'
require_dependency 'derkumpel_push/notify_job'

Rails.application.config.to_prepare do
  Issue.include(DerkumpelPush::IssueCallbacks) unless Issue.included_modules.include?(DerkumpelPush::IssueCallbacks)
  Journal.include(DerkumpelPush::JournalCallbacks) unless Journal.included_modules.include?(DerkumpelPush::JournalCallbacks)
end

Redmine::Plugin.register :derkumpel_push do
  name 'DerKumpel Push Bridge'
  author 'DerKumpel'
  description 'Sends assignment, status, comment, priority and date events to the optional DerKumpel Web Push adapter.'
  version '0.1.0'
  requires_redmine version_or_higher: '5.0.0'
end
