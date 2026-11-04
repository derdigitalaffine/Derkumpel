require 'securerandom'

module DerkumpelPush
  module Notifications
    def self.assigned_users(issue)
      assignee = issue.assigned_to
      users = assignee.is_a?(Group) ? assignee.users.to_a : [assignee].compact
      # Redmine, not DerKumpel, decides which users may view this issue.
      users.select { |user| user.is_a?(User) && user.active? && issue.visible?(user) }
    end

    def self.enqueue(issue, kind, journal: nil)
      return if ENV['DERKUMPEL_PUSH_URL'].to_s.empty?
      users = assigned_users(issue)
      if journal && journal.private_notes?
        users = users.select { |user| user.allowed_to?(:view_private_notes, issue.project) }
      end
      # Do not notify the user of their own action.
      actor_id = journal ? journal.user_id : User.current&.id
      ids = users.map(&:id).uniq.reject { |id| id == actor_id }
      return if ids.empty?

      DerkumpelPush::NotifyJob.perform_later(
        'event_id' => SecureRandom.uuid,
        'issue_id' => issue.id,
        'kind' => kind,
        'user_ids' => ids
      )
    rescue => error
      Rails.logger.error("[derkumpel_push] Could not queue push event: #{error.class}: #{error.message}")
    end
  end

  module IssueCallbacks
    extend ActiveSupport::Concern
    included do
      after_commit :derkumpel_notify_issue_changes, on: [:create, :update]
    end

    private

    def derkumpel_notify_issue_changes
      changed = saved_changes.keys
      # On creation, assignment is the only meaningful notification. Do not
      # flood phones with an initial status/priority/start-date push as well.
      if changed.include?('id')
        DerkumpelPush::Notifications.enqueue(self, 'assignment') if assigned_to_id.present?
        return
      end
      if changed.include?('assigned_to_id')
        DerkumpelPush::Notifications.enqueue(self, 'assignment')
      end
      DerkumpelPush::Notifications.enqueue(self, 'status') if changed.include?('status_id')
      DerkumpelPush::Notifications.enqueue(self, 'priority') if changed.include?('priority_id')
      if changed.include?('start_date') || changed.include?('due_date')
        DerkumpelPush::Notifications.enqueue(self, 'dates')
      end
    end
  end

  module JournalCallbacks
    extend ActiveSupport::Concern
    included do
      after_commit :derkumpel_notify_comment, on: [:create]
    end

    private

    def derkumpel_notify_comment
      return unless journalized_type == 'Issue' && notes.present?
      issue = journalized
      DerkumpelPush::Notifications.enqueue(issue, 'comment', journal: self) if issue
    end
  end
end
